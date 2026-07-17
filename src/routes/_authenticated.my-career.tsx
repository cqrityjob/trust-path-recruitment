import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  Compass,
  Briefcase,
  RefreshCcw,
  LogOut,
  User as UserIcon,
  Sparkles,
  MapPin,
  Building2,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { listAssessmentRuns } from "@/lib/journey/journey.functions";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { getProfession } from "@/lib/career-center/professions";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import { employmentTypeLabel } from "@/lib/job-intelligence/enum-labels";

/**
 * Phase F.1 — /my-career
 *
 * Authenticated landing page ("My Career"). Composes existing surfaces:
 *   - Assessment runs (journey.functions.listAssessmentRuns)
 *   - Career Profile for Jobs (useCareerProfileForJobs, Phase E)
 *   - Public jobs (listPublicJobs, Phase C)
 *   - Career Center (profession registry)
 *
 * No new scoring, no schema changes. All copy is inline bilingual so the
 * page reflects the current `lang` without extending the i18n dictionary
 * for one-off dashboard strings.
 */
export const Route = createFileRoute("/_authenticated/my-career")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Career — CQrityjob" },
      {
        name: "description",
        content:
          "Your personal career home — assessment status, career profile, recommended professions and jobs.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyCareerPage,
});

type Copy = { sv: string; en: string };
const c = (sv: string, en: string): Copy => ({ sv, en });
function L(v: Copy, lang: "sv" | "en") {
  return v[lang];
}

function MyCareerPage() {
  const { lang } = useT();
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const nm =
        (typeof meta.display_name === "string" && meta.display_name) ||
        (typeof meta.name === "string" && meta.name) ||
        (data.user.email ?? "").split("@")[0] ||
        "";
      setDisplayName(nm);
      setEmail(data.user.email ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);

  const fetchRuns = useServerFn(listAssessmentRuns);
  const runsQ = useQuery({
    queryKey: ["my-career", "runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
  });

  const profileState = useCareerProfileForJobs();
  const profile =
    profileState.status === "ready" ? profileState.data.profile : undefined;

  // Top family (career area) inferred from the profile — used to seed the
  // "relevant jobs" list. Falls back to an unfiltered list.
  const topFamilyId = profile
    ? Object.entries(profile.familyScores)
        .sort(
          ([, a], [, b]) =>
            (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2,
        )
        .map(([id]) => id)[0]
    : undefined;

  const jobsQ = useQuery({
    queryKey: ["my-career", "jobs", topFamilyId ?? "all"],
    queryFn: () => listPublicJobs({ familyId: topFamilyId, limit: 3 }),
    staleTime: 60_000,
  });

  // Top 3 slug-level recommendations from the profile, filtered to slugs
  // that resolve against the Career Center registry.
  const topProfessions = profile
    ? Object.entries(profile.slugScores)
        .map(([slug, s]) => ({ slug, ...s, prof: getProfession(slug) }))
        .filter((r) => !!r.prof)
        .sort(
          (a, b) =>
            (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2,
        )
        .slice(0, 3)
    : [];

  const latestRun = runsQ.data?.[0];
  const hasProfile = profileState.status === "ready";
  const noAssessment =
    (runsQ.data && runsQ.data.length === 0) ||
    profileState.status === "no_profile";

  async function onSignOut() {
    await supabase.auth.signOut();
    // The _authenticated layout listener redirects to /auth on SIGNED_OUT.
  }

  const greeting = L(c("Välkommen", "Welcome back"), lang);

  return (
    <SiteLayout>
      <Section>
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {L(c("Min karriär", "My career"), lang)}
          </p>
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {greeting}
            {displayName ? `, ${displayName}` : ""}.
          </h1>
          <p className="mt-3 text-muted-foreground">
            {L(
              c(
                "Din personliga karriärstartsida. Här ser du din senaste bedömning, din karriärprofil, rekommenderade yrken och relevanta jobb.",
                "Your personal career home — assessment status, career profile, recommended professions and jobs.",
              ),
              lang,
            )}
          </p>
        </header>

        {/* Onboarding — no assessment yet */}
        {noAssessment && (
          <div className="mt-10 rounded-lg border border-primary/30 bg-primary/5 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <Sparkles
                className="mt-0.5 h-6 w-6 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-foreground">
                  {L(
                    c("Börja med säkerhetstestet", "Start with the assessment"),
                    lang,
                  )}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {L(
                    c(
                      "Vi behöver några minuter för att förstå dina styrkor och motivationer. Sedan visar vi rekommenderade yrken, utvecklingsvägar och relevanta jobb baserat på din profil.",
                      "We need a few minutes to understand your strengths and motivations. Then we'll show you recommended professions, development paths and relevant jobs based on your profile.",
                    ),
                    lang,
                  )}
                </p>
                <Link
                  to="/security-career-assessment"
                  className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {L(
                    c("Gör säkerhetstestet", "Take the assessment"),
                    lang,
                  )}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="space-y-6">
            {/* Latest assessment */}
            <DashboardCard
              icon={<ClipboardCheck className="h-5 w-5" />}
              title={L(c("Senaste bedömning", "Latest assessment"), lang)}
            >
              {runsQ.isLoading && (
                <p className="text-sm text-muted-foreground">
                  {L(c("Laddar…", "Loading…"), lang)}
                </p>
              )}
              {runsQ.isError && (
                <p className="text-sm text-destructive">
                  {L(
                    c(
                      "Kunde inte hämta bedömningar just nu. Försök igen senare.",
                      "Couldn't load your assessments right now. Try again later.",
                    ),
                    lang,
                  )}
                </p>
              )}
              {runsQ.data && runsQ.data.length === 0 && (
                <EmptyState
                  what={L(
                    c(
                      "Här visas resultaten från säkerhetstestet.",
                      "This is where your assessment results appear.",
                    ),
                    lang,
                  )}
                  why={L(
                    c(
                      "Bedömningen är grunden för dina rekommendationer.",
                      "The assessment is the foundation of every recommendation.",
                    ),
                    lang,
                  )}
                  ctaLabel={L(c("Gör testet", "Take it now"), lang)}
                  ctaTo="/security-career-assessment"
                />
              )}
              {latestRun && (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">
                      {new Date(
                        latestRun.completed_at ?? latestRun.started_at,
                      ).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {L(c("Status", "Status"), lang)}: {latestRun.status}
                    </p>
                  </div>
                  <Link
                    to="/security-career-assessment"
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {L(c("Gör om testet", "Retake"), lang)}
                  </Link>
                </div>
              )}
            </DashboardCard>

            {/* Career profile */}
            {hasProfile && profile && (
              <DashboardCard
                icon={<UserIcon className="h-5 w-5" />}
                title={L(c("Karriärprofil", "Career profile"), lang)}
              >
                <div className="space-y-3 text-sm">
                  {profile.archetype && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {L(c("Din stil", "Your style"), lang)}
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {lang === "sv"
                          ? profile.archetype.labelSv
                          : profile.archetype.labelEn}
                      </p>
                    </div>
                  )}
                  {profile.motivations.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {L(c("Vad driver dig", "What drives you"), lang)}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {profile.motivations.map((m) => (
                          <li
                            key={m.key}
                            className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
                          >
                            {lang === "sv" ? m.labelSv : m.labelEn}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {topFamilyId && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {L(c("Starkast område", "Strongest area"), lang)}
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {getCareerAreaLabel(topFamilyId)?.name[lang] ??
                          topFamilyId}
                      </p>
                    </div>
                  )}
                </div>
              </DashboardCard>
            )}

            {/* Recommended professions */}
            {hasProfile && topProfessions.length > 0 && (
              <DashboardCard
                icon={<Compass className="h-5 w-5" />}
                title={L(
                  c("Rekommenderade yrken", "Recommended professions"),
                  lang,
                )}
              >
                <ul className="divide-y divide-border">
                  {topProfessions.map((r) => (
                    <li
                      key={r.slug}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/career-center/$profession"
                          params={{ profession: r.slug }}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {lang === "sv" ? r.prof!.titleSv : r.prof!.titleEn}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {getCareerAreaLabel(r.familyKey)?.name[lang] ??
                            r.familyKey}
                        </p>
                      </div>
                      <Link
                        to="/jobs/profession/$professionSlug"
                        params={{ professionSlug: r.slug }}
                        className="shrink-0 text-xs text-primary hover:underline"
                      >
                        {L(c("Se jobb", "See jobs"), lang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </DashboardCard>
            )}

            {/* Relevant jobs */}
            <DashboardCard
              icon={<Briefcase className="h-5 w-5" />}
              title={L(c("Relevanta jobb", "Relevant jobs"), lang)}
              action={
                <Link
                  to="/jobs"
                  className="text-xs text-primary hover:underline"
                >
                  {L(c("Alla jobb", "All jobs"), lang)} →
                </Link>
              }
            >
              {jobsQ.isLoading && (
                <p className="text-sm text-muted-foreground">
                  {L(c("Laddar…", "Loading…"), lang)}
                </p>
              )}
              {jobsQ.data && jobsQ.data.length === 0 && (
                <EmptyState
                  what={L(
                    c(
                      "Just nu finns inga öppna roller som matchar din profil.",
                      "No open roles match your profile right now.",
                    ),
                    lang,
                  )}
                  why={L(
                    c(
                      "Nya roller publiceras regelbundet av verifierade arbetsgivare.",
                      "New roles are published regularly by verified employers.",
                    ),
                    lang,
                  )}
                  ctaLabel={L(c("Bläddra alla jobb", "Browse all jobs"), lang)}
                  ctaTo="/jobs"
                />
              )}
              {jobsQ.data && jobsQ.data.length > 0 && (
                <ul className="divide-y divide-border">
                  {jobsQ.data.map((j) => {
                    const title =
                      (lang === "sv" ? j.title_sv : j.title_en) ||
                      j.title_en ||
                      j.title_sv ||
                      "";
                    const location =
                      [j.location_text, j.city, j.country]
                        .filter(Boolean)
                        .join(", ") || "";
                    return (
                      <li key={j.id} className="py-3 first:pt-0 last:pb-0">
                        <Link
                          to="/jobs/$slug"
                          params={{ slug: j.slug }}
                          className="block group"
                        >
                          <p className="text-sm font-medium text-foreground group-hover:underline">
                            {title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {location}
                              </span>
                            )}
                            {j.employment_type && (
                              <span className="inline-flex items-center gap-1">
                                <Building2
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                {employmentTypeLabel(j.employment_type, lang)}
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashboardCard>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Personal Job Relevance summary */}
            {hasProfile && (
              <DashboardCard
                icon={<Sparkles className="h-5 w-5" />}
                title={L(
                  c("Din jobbrelevans", "Your job relevance"),
                  lang,
                )}
              >
                <p className="text-sm text-muted-foreground">
                  {L(
                    c(
                      "Vi jämför öppna roller mot din karriärprofil och lyfter det som matchar dig — utan att någon annan ser dina svar.",
                      "We compare open roles against your career profile and surface what fits — without exposing your answers to anyone else.",
                    ),
                    lang,
                  )}
                </p>
                <Link
                  to="/jobs"
                  className="mt-3 inline-flex items-center text-sm text-primary hover:underline"
                >
                  {L(
                    c("Utforska relevanta jobb", "Explore relevant jobs"),
                    lang,
                  )}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </DashboardCard>
            )}

            {/* Recommended next step */}
            <DashboardCard
              icon={<ArrowRight className="h-5 w-5" />}
              title={L(c("Nästa steg", "Recommended next step"), lang)}
            >
              {noAssessment ? (
                <NextStep
                  body={L(
                    c(
                      "Slutför säkerhetstestet så låser du upp rekommendationer.",
                      "Complete the assessment to unlock recommendations.",
                    ),
                    lang,
                  )}
                  ctaTo="/security-career-assessment"
                  ctaLabel={L(c("Starta testet", "Start assessment"), lang)}
                />
              ) : topProfessions.length > 0 ? (
                <NextStep
                  body={L(
                    c(
                      "Utforska ditt topprekommenderade yrke i Karriärcentret.",
                      "Explore your top recommended profession in the Career Center.",
                    ),
                    lang,
                  )}
                  ctaTo="/career-center/$profession"
                  ctaParams={{ profession: topProfessions[0].slug }}
                  ctaLabel={
                    lang === "sv"
                      ? topProfessions[0].prof!.titleSv
                      : topProfessions[0].prof!.titleEn
                  }
                />
              ) : (
                <NextStep
                  body={L(
                    c(
                      "Bläddra Karriärcentret för att välja ett målprofession.",
                      "Browse the Career Center to pick a target profession.",
                    ),
                    lang,
                  )}
                  ctaTo="/career-center"
                  ctaLabel={L(
                    c("Öppna Karriärcentret", "Open Career Center"),
                    lang,
                  )}
                />
              )}
            </DashboardCard>

            {/* Quick links */}
            <DashboardCard title={L(c("Snabbåtkomst", "Quick access"), lang)}>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    to="/career-center"
                    className="text-foreground hover:underline"
                  >
                    {L(c("Karriärcenter", "Career Center"), lang)}
                  </Link>
                </li>
                <li>
                  <Link to="/jobs" className="text-foreground hover:underline">
                    {L(c("Jobb", "Jobs"), lang)}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/security-career-assessment"
                    className="text-foreground hover:underline"
                  >
                    {L(c("Säkerhetstestet", "Security Career Assessment"), lang)}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/journey"
                    className="text-foreground hover:underline"
                  >
                    {L(c("Karriärresa (beta)", "Career Journey (beta)"), lang)}
                  </Link>
                </li>
              </ul>
            </DashboardCard>

            {/* Account */}
            <DashboardCard
              icon={<UserIcon className="h-5 w-5" />}
              title={L(c("Konto", "Account"), lang)}
            >
              <div className="space-y-2 text-sm">
                {displayName && (
                  <p className="font-medium text-foreground">{displayName}</p>
                )}
                {email && (
                  <p className="text-xs text-muted-foreground">{email}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {L(
                    c(
                      "Byt språk i sidfoten. Kontoinställningar kommer i en framtida version.",
                      "Change language in the footer. Full account settings arrive in a future release.",
                    ),
                    lang,
                  )}
                </p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  {L(c("Logga ut", "Sign out"), lang)}
                </button>
              </div>
            </DashboardCard>
          </aside>
        </div>
      </Section>
    </SiteLayout>
  );
}

function DashboardCard({
  icon,
  title,
  action,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-5 md:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary">{icon}</span>}
          <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({
  what,
  why,
  ctaLabel,
  ctaTo,
}: {
  what: string;
  why: string;
  ctaLabel: string;
  ctaTo: "/security-career-assessment" | "/jobs" | "/career-center";
}) {
  return (
    <div>
      <p className="text-sm text-foreground">{what}</p>
      <p className="mt-1 text-sm text-muted-foreground">{why}</p>
      <Link
        to={ctaTo}
        className="mt-3 inline-flex items-center text-sm text-primary hover:underline"
      >
        {ctaLabel}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function NextStep({
  body,
  ctaTo,
  ctaParams,
  ctaLabel,
}: {
  body: string;
  ctaTo: string;
  ctaParams?: Record<string, string>;
  ctaLabel: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link
        // The router's typed <Link> is unhappy with dynamic string routes.
        // Cast is safe: all call sites in this file pass known route
        // literals ("/security-career-assessment", "/career-center",
        // "/career-center/$profession").
        to={ctaTo as never}
        params={ctaParams as never}
        className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {ctaLabel}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}