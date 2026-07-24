import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  CheckCircle2,
  Circle,
  Target,
  TrendingUp,
  Award,
  Flame,
  Eye,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { SecurityCareerProfileCard } from "@/components/assessment/SecurityCareerProfileCard";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { listAssessmentRuns } from "@/lib/journey/journey.functions";
import {
  getMyLinkableAssignments,
  claimAssessmentAssignment,
} from "@/lib/job-intelligence/assessment-assignments.functions";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { getProfession } from "@/lib/career-center/professions";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import { employmentTypeLabel } from "@/lib/job-intelligence/enum-labels";
import { dimensionLabel } from "@/lib/job-intelligence/personal-relevance";
import type { CareerProfileForJobsV1 } from "@/lib/career-intelligence-engine/profile-for-jobs";
import type { ConfidenceLevel } from "@/lib/career-intelligence-engine/types";

/**
 * Phase F.2 — /my-career (polished).
 *
 * The dashboard is a composition of existing surfaces:
 *   - Assessment runs (journey.functions.listAssessmentRuns)
 *   - Career Profile for Jobs (Phase E)
 *   - Public jobs (Phase C)
 *   - Career Center registry
 *
 * No new scoring, no schema changes. Confidence is exposed as
 * Low/Medium/High only — the raw score never surfaces.
 */
export const Route = createFileRoute("/_authenticated/my-career/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Career — CQrityjob" },
      {
        name: "description",
        content:
          "Your personal career home — assessment summary, career profile, recommended professions and jobs.",
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

// -----------------------------------------------------------------
// Derived helpers
// -----------------------------------------------------------------

function pickTopFamily(profile: CareerProfileForJobsV1) {
  return Object.entries(profile.familyScores)
    .sort(([, a], [, b]) => (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2)
    .map(([id]) => id)[0];
}

function pickTopProfessions(profile: CareerProfileForJobsV1, n: number) {
  return Object.entries(profile.slugScores)
    .map(([slug, s]) => ({ slug, ...s, prof: getProfession(slug) }))
    .filter((r) => !!r.prof)
    .sort((a, b) => (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2)
    .slice(0, n);
}

function confidenceBand(level: ConfidenceLevel, lang: "sv" | "en") {
  if (level === "stronger") return { label: lang === "sv" ? "Hög" : "High", tone: "high" as const };
  if (level === "moderate")
    return { label: lang === "sv" ? "Medel" : "Medium", tone: "medium" as const };
  return { label: lang === "sv" ? "Låg" : "Low", tone: "low" as const };
}

// -----------------------------------------------------------------
// Page
// -----------------------------------------------------------------

function MyCareerPage() {
  const { lang, t } = useT();
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

  // Employer-assigned assessments completed before this account existed or
  // was signed in, matched by verified email, not yet linked to a real
  // assessment_runs row -- surfaced so linking is always an explicit,
  // signed-in action, never automatic.
  const qc = useQueryClient();
  const fetchLinkable = useServerFn(getMyLinkableAssignments);
  const linkableQ = useQuery({
    queryKey: ["my-career", "linkable-assignments"],
    queryFn: () => fetchLinkable(),
    staleTime: 30_000,
  });
  const claimFn = useServerFn(claimAssessmentAssignment);
  const claimMutation = useMutation({
    mutationFn: (assignmentId: string) => claimFn({ data: { assignmentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-career", "runs"] });
      qc.invalidateQueries({ queryKey: ["my-career", "linkable-assignments"] });
    },
  });

  // Phase G2 — entry point is gated on BOTH the feature flag and having
  // at least one active membership. `enabled: employerPortalEnabled()`
  // means no request is made at all while the flag is false — "no
  // entry point at all" applies to data-fetching, not just rendering.
  const fetchEmployerWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const employerWorkspacesQ = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => fetchEmployerWorkspaces(),
    enabled: employerPortalEnabled(),
  });
  const hasEmployerWorkspace = (employerWorkspacesQ.data?.length ?? 0) > 0;

  const profileState = useCareerProfileForJobs();
  const profile = profileState.status === "ready" ? profileState.data.profile : undefined;

  const topFamilyId = profile ? pickTopFamily(profile) : undefined;
  const topProfessions = profile ? pickTopProfessions(profile, 3) : [];
  const topProfession = topProfessions[0];

  const jobsQ = useQuery({
    queryKey: ["my-career", "jobs", topFamilyId ?? "all"],
    queryFn: () => listPublicJobs({ familyId: topFamilyId, limit: 3 }),
    staleTime: 60_000,
  });

  const jobsForTopFamilyQ = useQuery({
    queryKey: ["my-career", "family-job-counts", topProfessions.map((p) => p.slug)],
    queryFn: async () => {
      // Small parallel probe to know which recommended professions have
      // at least one open role. Cheap: each call is limited to 1 row.
      const results = await Promise.all(
        topProfessions.map(async (p) => ({
          slug: p.slug,
          hasJobs: (await listPublicJobs({ professionSlug: p.slug, limit: 1 })).length > 0,
        })),
      );
      return Object.fromEntries(results.map((r) => [r.slug, r.hasJobs] as const));
    },
    enabled: topProfessions.length > 0,
    staleTime: 60_000,
  });

  const latestRun = runsQ.data?.[0];
  const hasCompletedAssessment = !!latestRun && latestRun.status === "completed";
  const hasProfile = profileState.status === "ready" && !!profile;
  const noAssessment =
    runsQ.status === "success" && (runsQ.data.length === 0 || profileState.status === "no_profile");

  async function onSignOut() {
    await supabase.auth.signOut();
  }

  const greeting = L(c("Välkommen tillbaka", "Welcome back"), lang);
  const topAreaLabel = topFamilyId ? getCareerAreaLabel(topFamilyId)?.name[lang] : undefined;
  const topProfTitle = topProfession
    ? lang === "sv"
      ? topProfession.prof!.titleSv
      : topProfession.prof!.titleEn
    : undefined;

  return (
    <SiteLayout>
      <Section>
        {/* ---------------- Hero ---------------- */}
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
            {hasProfile
              ? L(
                  c(
                    "Här är din personliga karriärsöversikt — din profil, rekommenderade yrken och relevanta jobb.",
                    "Here is your personal career overview — your profile, recommended professions and relevant jobs.",
                  ),
                  lang,
                )
              : L(
                  c(
                    "Din personliga karriärstartsida. Slutför säkerhetstestet för att låsa upp rekommendationer.",
                    "Your personal career home. Complete the assessment to unlock recommendations.",
                  ),
                  lang,
                )}
          </p>
        </header>

        {/* ---------------- Career Journey ---------------- */}
        <div className="mt-8">
          <CareerJourney
            lang={lang}
            steps={{
              assessment: hasCompletedAssessment,
              profile: hasProfile,
              explore: hasProfile && topProfessions.length > 0,
              apply: false,
              develop: false,
            }}
          />
        </div>

        {/* Onboarding — no assessment yet */}
        {noAssessment && (
          <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-foreground">
                  {L(c("Börja med säkerhetstestet", "Start with the assessment"), lang)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {L(
                    c(
                      "Testet tar cirka fem minuter. Efteråt visar vi din karriärprofil, rekommenderade yrken, utvecklingsvägar och relevanta jobb.",
                      "It takes about five minutes. Afterwards we present your career profile, recommended professions, development paths and relevant jobs.",
                    ),
                    lang,
                  )}
                </p>
                <Link
                  to="/security-career-assessment"
                  className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {L(c("Gör säkerhetstestet", "Take the assessment"), lang)}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Main grid ---------------- */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* Assessment summary */}
            <DashboardCard
              icon={<ClipboardCheck className="h-5 w-5" />}
              title={L(c("Bedömningssammanfattning", "Assessment summary"), lang)}
            >
              {runsQ.isLoading && (
                <p className="text-sm text-muted-foreground">{L(c("Laddar…", "Loading…"), lang)}</p>
              )}
              {runsQ.isError && (
                <p className="text-sm text-destructive">
                  {L(
                    c(
                      "Kunde inte hämta din bedömning just nu. Försök igen om en stund.",
                      "Couldn't load your assessment right now. Please try again shortly.",
                    ),
                    lang,
                  )}
                </p>
              )}
              {runsQ.data && runsQ.data.length === 0 && (
                <EmptyState
                  what={L(
                    c(
                      "Här visas din bedömningssammanfattning så snart testet är klart.",
                      "Your assessment summary appears here as soon as the test is complete.",
                    ),
                    lang,
                  )}
                  why={L(
                    c(
                      "Bedömningen är grunden för alla rekommendationer på plattformen.",
                      "The assessment is the foundation of every recommendation on the platform.",
                    ),
                    lang,
                  )}
                  ctaLabel={L(c("Gör säkerhetstestet", "Take the assessment"), lang)}
                  ctaTo="/security-career-assessment"
                />
              )}
              {latestRun && (
                <AssessmentSummary
                  lang={lang}
                  completedAt={latestRun.completed_at ?? latestRun.started_at}
                  profile={profile}
                  topProfession={topProfTitle}
                  topArea={topAreaLabel}
                  runId={latestRun.id}
                />
              )}
            </DashboardCard>

            {/* Employer-assigned assessments completed before sign-in,
                matched by verified email, offered for explicit linking. */}
            {linkableQ.data && linkableQ.data.length > 0 && (
              <DashboardCard
                icon={<ClipboardCheck className="h-5 w-5" />}
                title={L(
                  c("Bedömning att koppla till din profil", "Assessment ready to link"),
                  lang,
                )}
              >
                <p className="mb-3 text-sm text-muted-foreground">
                  {L(
                    c(
                      "Du har genomfört en arbetsgivartilldelad bedömning med den här e-postadressen. Koppla resultatet till din profil för att se det under Mina rapporter.",
                      "You've completed an employer-assigned assessment with this email address. Link the result to your profile to see it under My Reports.",
                    ),
                    lang,
                  )}
                </p>
                <ul className="divide-y divide-border">
                  {linkableQ.data.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-sm text-foreground">
                        {lang === "sv" ? a.assessmentNameSv : a.assessmentNameEn}
                      </span>
                      <button
                        type="button"
                        disabled={claimMutation.isPending}
                        onClick={() => claimMutation.mutate(a.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        {L(c("Koppla till min profil", "Link to my profile"), lang)}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </DashboardCard>
            )}

            {/* Previous reports — reuses runsQ.data, already fetched above;
                no new query. Excludes the latest run, already linked from
                the Assessment summary card. */}
            {runsQ.data && runsQ.data.length > 1 && (
              <DashboardCard
                icon={<ClipboardCheck className="h-5 w-5" />}
                title={L(c("Tidigare rapporter", "Previous reports"), lang)}
              >
                <ul className="divide-y divide-border">
                  {runsQ.data.slice(1).map((run: any) => {
                    const runDate = new Date(run.completed_at ?? run.started_at).toLocaleDateString(
                      lang === "sv" ? "sv-SE" : "en-GB",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    );
                    return (
                      <li key={run.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="text-sm text-foreground">{runDate}</span>
                        <Link
                          to="/my-career/reports/$runId"
                          params={{ runId: run.id }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                        >
                          {L(c("Visa rapport", "View report"), lang)}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </DashboardCard>
            )}

            {/* Security Career Profile — editable, contextual only (Phase 1) */}
            <DashboardCard
              icon={<UserIcon className="h-5 w-5" />}
              title={L(c("Din säkerhetskarriärprofil", "Your Security Career Profile"), lang)}
            >
              <SecurityCareerProfileCard />
            </DashboardCard>

            {/* Career profile */}
            {hasProfile && profile && (
              <DashboardCard
                icon={<UserIcon className="h-5 w-5" />}
                title={L(c("Din karriärprofil", "Your career profile"), lang)}
              >
                <CareerProfileBlock
                  lang={lang}
                  profile={profile}
                  topFamilyId={topFamilyId}
                  topSlug={topProfession?.slug}
                />
              </DashboardCard>
            )}

            {/* Recommended professions */}
            {hasProfile && topProfessions.length > 0 && (
              <DashboardCard
                icon={<Compass className="h-5 w-5" />}
                title={L(c("Rekommenderade yrken", "Recommended professions"), lang)}
              >
                <ul className="grid gap-3 sm:grid-cols-1">
                  {topProfessions.map((r) => {
                    const areaLabel = getCareerAreaLabel(r.familyKey)?.name[lang] ?? r.familyKey;
                    const summary =
                      (lang === "sv" ? r.prof!.description.sv : r.prof!.description.en) || "";
                    const hasJobs = jobsForTopFamilyQ.data?.[r.slug];
                    return (
                      <li
                        key={r.slug}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h3 className="text-base font-semibold text-foreground">
                            {lang === "sv" ? r.prof!.titleSv : r.prof!.titleEn}
                          </h3>
                          <span className="text-xs uppercase tracking-widest text-muted-foreground">
                            {areaLabel}
                          </span>
                        </div>
                        {summary && (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {summary}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            to="/career-center/$profession"
                            params={{ profession: r.slug }}
                            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            {L(c("Utforska yrke", "Explore profession"), lang)}
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Link>
                          {hasJobs && (
                            <Link
                              to="/jobs/profession/$professionSlug"
                              params={{ professionSlug: r.slug }}
                              className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                            >
                              {L(c("Visa jobb", "View jobs"), lang)}
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </DashboardCard>
            )}

            {/* Relevant jobs */}
            <DashboardCard
              icon={<Briefcase className="h-5 w-5" />}
              title={L(c("Relevanta jobb för dig", "Relevant jobs for you"), lang)}
              action={
                <Link to="/jobs" className="text-xs text-primary hover:underline">
                  {L(c("Alla jobb", "All jobs"), lang)} →
                </Link>
              }
            >
              {jobsQ.isLoading && (
                <p className="text-sm text-muted-foreground">{L(c("Laddar…", "Loading…"), lang)}</p>
              )}
              {jobsQ.data && jobsQ.data.length === 0 && (
                <EmptyState
                  what={L(
                    c(
                      "Just nu finns inga öppna roller som matchar din profil.",
                      "We don't currently have open roles matching your profile.",
                    ),
                    lang,
                  )}
                  why={L(
                    c(
                      "Utforska alla säkerhetsjobb eller upptäck närliggande yrken medan nya möjligheter läggs till.",
                      "Explore all security jobs or discover related professions while new opportunities are added.",
                    ),
                    lang,
                  )}
                  ctaLabel={L(c("Bläddra alla jobb", "Browse all jobs"), lang)}
                  ctaTo="/jobs"
                  secondaryLabel={L(c("Utforska yrken", "Explore professions"), lang)}
                  secondaryTo="/career-center"
                />
              )}
              {jobsQ.data && jobsQ.data.length > 0 && (
                <ul className="divide-y divide-border">
                  {jobsQ.data.map((j) => {
                    const title =
                      (lang === "sv" ? j.title_sv : j.title_en) || j.title_en || j.title_sv || "";
                    const location =
                      [j.location_text, j.city, j.country].filter(Boolean).join(", ") || "";
                    return (
                      <li key={j.id} className="py-3 first:pt-0 last:pb-0">
                        <Link to="/jobs/$slug" params={{ slug: j.slug }} className="group block">
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
                                <Building2 className="h-3 w-3" aria-hidden="true" />
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
            <DashboardCard
              icon={<Target className="h-5 w-5" />}
              title={L(c("Nästa steg", "Recommended next step"), lang)}
            >
              <NextStep
                lang={lang}
                noAssessment={noAssessment}
                topAreaLabel={topAreaLabel}
                topProfTitle={topProfTitle}
                topSlug={topProfession?.slug}
              />
            </DashboardCard>

            <DashboardCard title={L(c("Snabbåtgärder", "Quick actions"), lang)}>
              <ul className="space-y-2 text-sm">
                <li>
                  <QuickLink
                    to="/my-career"
                    hash="career-profile"
                    label={L(c("Min karriärprofil", "My career profile"), lang)}
                  />
                </li>
                <li>
                  <QuickLink
                    to="/career-center"
                    label={L(c("Utforska yrken", "Explore professions"), lang)}
                  />
                </li>
                <li>
                  <QuickLink to="/jobs" label={L(c("Bläddra jobb", "Browse jobs"), lang)} />
                </li>
                <li>
                  <QuickLink
                    to="/my-career/applications"
                    label={L(c("Mina ansökningar", "My applications"), lang)}
                  />
                </li>
                <li>
                  <QuickLink
                    to="/security-career-assessment"
                    label={L(c("Gör om testet", "Retake assessment"), lang)}
                  />
                </li>
              </ul>
            </DashboardCard>

            <DashboardCard
              icon={<UserIcon className="h-5 w-5" />}
              title={L(c("Konto", "Account"), lang)}
            >
              <div className="space-y-2 text-sm">
                {displayName && <p className="font-medium text-foreground">{displayName}</p>}
                {email && <p className="text-xs text-muted-foreground">{email}</p>}
                <p className="text-xs text-muted-foreground">
                  {L(
                    c(
                      "Byt språk längst ner på sidan. Fler kontoinställningar kommer snart.",
                      "Change language at the bottom of the page. More account settings coming soon.",
                    ),
                    lang,
                  )}
                </p>
                {employerPortalEnabled() && hasEmployerWorkspace && (
                  <Link
                    to="/employer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("employer.workspace.label")}
                  </Link>
                )}
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

// -----------------------------------------------------------------
// Career Journey — horizontal stepper
// -----------------------------------------------------------------

function CareerJourney({
  lang,
  steps,
}: {
  lang: "sv" | "en";
  steps: {
    assessment: boolean;
    profile: boolean;
    explore: boolean;
    apply: boolean;
    develop: boolean;
  };
}) {
  const stages: Array<{ key: keyof typeof steps; label: string }> = [
    {
      key: "assessment",
      label: L(c("Genomför bedömning", "Complete assessment"), lang),
    },
    {
      key: "profile",
      label: L(c("Skapa karriärprofil", "Create career profile"), lang),
    },
    {
      key: "explore",
      label: L(c("Utforska yrken", "Explore professions"), lang),
    },
    { key: "apply", label: L(c("Sök en roll", "Apply for a role"), lang) },
    {
      key: "develop",
      label: L(c("Fortsätt utvecklas", "Continue developing"), lang),
    },
  ];

  return (
    <nav
      aria-label={L(c("Karriärresa", "Career journey"), lang)}
      className="rounded-xl border border-border bg-background p-4 md:p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground">
          {L(c("Din karriärresa", "Your career journey"), lang)}
        </h2>
      </div>
      <ol className="grid gap-3 sm:grid-cols-5">
        {stages.map((s, i) => {
          const done = steps[s.key];
          return (
            <li
              key={s.key}
              className={
                "flex items-start gap-2 rounded-lg border p-3 text-xs " +
                (done
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground")
              }
            >
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <CheckCircle2
                    className="h-4 w-4 text-primary"
                    aria-label={L(c("Klart", "Done"), lang)}
                  />
                ) : (
                  <Circle className="h-4 w-4" aria-label={L(c("Kvar", "Upcoming"), lang)} />
                )}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {L(c("Steg", "Step"), lang)} {i + 1}
                </p>
                <p className="mt-0.5 font-medium leading-snug">{s.label}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// -----------------------------------------------------------------
// Assessment summary — rich card
// -----------------------------------------------------------------

function AssessmentSummary({
  lang,
  completedAt,
  profile,
  topProfession,
  topArea,
  runId,
}: {
  lang: "sv" | "en";
  completedAt: string;
  profile: CareerProfileForJobsV1 | undefined;
  topProfession: string | undefined;
  topArea: string | undefined;
  runId: string;
}) {
  const date = new Date(completedAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const primaryMotivation =
    profile && profile.motivations[0]
      ? lang === "sv"
        ? profile.motivations[0].labelSv
        : profile.motivations[0].labelEn
      : undefined;
  const style = profile?.archetype
    ? lang === "sv"
      ? profile.archetype.labelSv
      : profile.archetype.labelEn
    : undefined;
  const topSlug =
    profile &&
    Object.entries(profile.slugScores)
      .sort(([, a], [, b]) => (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2)
      .map(([slug]) => slug)[0];
  const confidence = topSlug && profile ? profile.slugScores[topSlug].confidence : undefined;
  const band = confidence ? confidenceBand(confidence, lang) : undefined;

  return (
    <div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field
          label={L(c("Genomförd", "Completed"), lang)}
          value={date}
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
        />
        <Field
          label={L(c("Karriärprofil", "Career profile"), lang)}
          value={style ?? L(c("Ej tillgänglig", "Not available"), lang)}
          icon={<UserIcon className="h-3.5 w-3.5" />}
        />
        <Field
          label={L(c("Toppyrke", "Top recommended profession"), lang)}
          value={topProfession ?? L(c("Ej tillgänglig", "Not available"), lang)}
          icon={<Award className="h-3.5 w-3.5" />}
        />
        <Field
          label={L(c("Karriärområde", "Career area"), lang)}
          value={topArea ?? L(c("Ej tillgänglig", "Not available"), lang)}
          icon={<Compass className="h-3.5 w-3.5" />}
        />
        <Field
          label={L(c("Konfidensnivå", "Confidence"), lang)}
          value={
            band ? (
              <ConfidenceBadge lang={lang} tone={band.tone} label={band.label} />
            ) : (
              L(c("Ej tillgänglig", "Not available"), lang)
            )
          }
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <Field
          label={L(c("Primär drivkraft", "Primary motivation"), lang)}
          value={primaryMotivation ?? L(c("Ej tillgänglig", "Not available"), lang)}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {/* Phase 2: now points at a real saved-report route
            (/my-career/reports/$runId) instead of the assessment start
            page. If this run predates Phase 2 (no saved snapshot), the
            route itself renders a clear "not available for this result"
            state — it never silently starts a new assessment. */}
        <Link
          to="/my-career/reports/$runId"
          params={{ runId }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {L(c("Visa fullständig rapport", "View full report"), lang)}
        </Link>
        <Link
          to="/security-career-assessment"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {L(c("Gör om bedömningen", "Retake assessment"), lang)}
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {icon && <span className="text-primary/70">{icon}</span>}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ConfidenceBadge({
  lang,
  tone,
  label,
}: {
  lang: "sv" | "en";
  tone: "low" | "medium" | "high";
  label: string;
}) {
  const styles: Record<typeof tone, string> = {
    low: "bg-muted text-foreground",
    medium: "bg-primary/10 text-primary",
    high: "bg-primary text-primary-foreground",
  };
  const tip =
    tone === "high"
      ? L(
          c("Baserat på tydliga signaler i dina svar.", "Based on strong signals in your answers."),
          lang,
        )
      : tone === "medium"
        ? L(c("Baserat på delvis tydliga signaler.", "Based on partially clear signals."), lang)
        : L(
            c(
              "Baserat på ett fåtal signaler; gör gärna om testet senare.",
              "Based on limited signals; consider retaking the assessment later.",
            ),
            lang,
          );
  return (
    <span
      title={tip}
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " + styles[tone]
      }
    >
      {label}
    </span>
  );
}

// -----------------------------------------------------------------
// Career Profile — visual block
// -----------------------------------------------------------------

function CareerProfileBlock({
  lang,
  profile,
  topFamilyId,
  topSlug,
}: {
  lang: "sv" | "en";
  profile: CareerProfileForJobsV1;
  topFamilyId: string | undefined;
  topSlug: string | undefined;
}) {
  const workingStyle = profile.archetype
    ? lang === "sv"
      ? profile.archetype.labelSv
      : profile.archetype.labelEn
    : undefined;
  const motivations = profile.motivations.map((m) => (lang === "sv" ? m.labelSv : m.labelEn));
  const domain = topFamilyId ? getCareerAreaLabel(topFamilyId)?.name[lang] : undefined;

  const slugScore = topSlug ? profile.slugScores[topSlug] : undefined;
  const strongDims = slugScore
    ? slugScore.strongDims.slice(0, 4).map((d) => dimensionLabel(d, lang))
    : [];
  const developDims = slugScore
    ? slugScore.developDims.slice(0, 4).map((d) => dimensionLabel(d, lang))
    : [];

  return (
    <div id="career-profile" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileTile
          icon={<UserIcon className="h-4 w-4" />}
          label={L(c("Arbetsstil", "Working style"), lang)}
          value={workingStyle}
          fallback={L(c("Analyseras…", "Being analysed…"), lang)}
        />
        <ProfileTile
          icon={<Compass className="h-4 w-4" />}
          label={L(c("Föredraget område", "Preferred security domain"), lang)}
          value={domain}
          fallback={L(c("Ej fastställt", "Not determined"), lang)}
        />
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {L(c("Främsta drivkrafter", "Main motivations"), lang)}
        </p>
        {motivations.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {motivations.map((m, i) => (
              <li
                key={i}
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {L(
              c("Inga tydliga drivkrafter i det här testet.", "No clear motivations in this test."),
              lang,
            )}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {L(c("Starkaste kompetenser", "Strongest competencies"), lang)}
          </p>
          {strongDims.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {strongDims.map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span className="text-foreground">{d}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {L(c("Analyseras…", "Being analysed…"), lang)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {L(c("Utvecklingsområden", "Development areas"), lang)}
          </p>
          {developDims.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {developDims.map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-foreground">{d}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {L(
                c(
                  "Inga tydliga utvecklingsområden framkom.",
                  "No clear development areas identified.",
                ),
                lang,
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTile({
  icon,
  label,
  value,
  fallback,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  fallback: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value ?? fallback}</p>
    </div>
  );
}

// -----------------------------------------------------------------
// Next step + helpers
// -----------------------------------------------------------------

function NextStep({
  lang,
  noAssessment,
  topAreaLabel,
  topProfTitle,
  topSlug,
}: {
  lang: "sv" | "en";
  noAssessment: boolean;
  topAreaLabel: string | undefined;
  topProfTitle: string | undefined;
  topSlug: string | undefined;
}) {
  if (noAssessment) {
    return (
      <StepBody
        why={L(
          c(
            "Testet är grunden för alla rekommendationer på plattformen.",
            "The assessment is the foundation of every recommendation on the platform.",
          ),
          lang,
        )}
        gain={L(
          c(
            "Efteråt får du en personlig karriärprofil, rekommenderade yrken och relevanta jobb.",
            "Afterwards you get a personal career profile, recommended professions and relevant jobs.",
          ),
          lang,
        )}
        ctaLabel={L(c("Gör säkerhetstestet", "Take the assessment"), lang)}
        cta={
          <Link
            to="/security-career-assessment"
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {L(c("Starta testet", "Start assessment"), lang)}
            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
    );
  }

  if (topSlug && topProfTitle && topAreaLabel) {
    return (
      <StepBody
        why={L(
          c(
            `Din profil pekar mot stark potential inom ${topAreaLabel}.`,
            `Your profile indicates strong potential within ${topAreaLabel}.`,
          ),
          lang,
        )}
        gain={L(
          c(
            `Utforska ${topProfTitle} för att förstå kompetenskrav, certifieringar och tillgängliga möjligheter.`,
            `Explore ${topProfTitle} to understand required skills, certifications and available opportunities.`,
          ),
          lang,
        )}
        ctaLabel={topProfTitle}
        cta={
          <Link
            to="/career-center/$profession"
            params={{ profession: topSlug }}
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {L(c("Utforska yrket", "Explore profession"), lang)}
            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
    );
  }

  return (
    <StepBody
      why={L(
        c(
          "Att välja ett målprofession fokuserar din utveckling och gör rekommendationerna skarpare.",
          "Choosing a target profession focuses your development and sharpens every recommendation.",
        ),
        lang,
      )}
      gain={L(
        c(
          "Du får skräddarsydd vägledning och tydligare nästa steg.",
          "You'll get tailored guidance and clearer next steps.",
        ),
        lang,
      )}
      ctaLabel={L(c("Öppna Karriärcentret", "Open Career Center"), lang)}
      cta={
        <Link
          to="/career-center"
          className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {L(c("Öppna Karriärcentret", "Open Career Center"), lang)}
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    />
  );
}

function StepBody({
  why,
  gain,
  cta,
}: {
  why: string;
  gain: string;
  ctaLabel: string;
  cta: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-foreground">{why}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{gain}</p>
      {cta}
    </div>
  );
}

// -----------------------------------------------------------------
// Small components
// -----------------------------------------------------------------

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
    <section className="rounded-xl border border-border bg-background p-5 md:p-6">
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
  secondaryLabel,
  secondaryTo,
}: {
  what: string;
  why: string;
  ctaLabel: string;
  ctaTo: "/security-career-assessment" | "/jobs" | "/career-center";
  secondaryLabel?: string;
  secondaryTo?: "/security-career-assessment" | "/jobs" | "/career-center";
}) {
  return (
    <div>
      <p className="text-sm text-foreground">{what}</p>
      <p className="mt-1 text-sm text-muted-foreground">{why}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={ctaTo}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {ctaLabel}
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {secondaryLabel && secondaryTo && (
          <Link
            to={secondaryTo}
            className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

function QuickLink({
  to,
  hash,
  label,
}: {
  to:
    | "/my-career"
    | "/my-career/applications"
    | "/career-center"
    | "/jobs"
    | "/security-career-assessment";
  hash?: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      hash={hash}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
    >
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
