import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, MapPin, RefreshCcw } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { ReportHistoryList } from "@/components/career-discovery/ReportHistoryList";
import {
  getActiveCareerReport,
  isRenderableDiscovery,
} from "@/lib/career-discovery/active-report.functions";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";
import { useT } from "@/i18n/context";
import { ProfessionalIdentityHeader } from "@/components/professional-identity/ProfessionalIdentityHeader";
import { NextActions } from "@/components/professional-identity/NextActions";
import {
  CareerSnapshot,
  type CareerAnalysisState,
} from "@/components/professional-identity/CareerSnapshot";
import { RecentActivity } from "@/components/professional-identity/RecentActivity";
import { ActiveWork } from "@/components/professional-identity/ActiveWork";
import { ExploreAndGrow } from "@/components/professional-identity/ExploreAndGrow";
import { CareerJourney } from "@/components/professional-identity/CareerJourney";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
} from "@/lib/professional-identity/verification-attention";
import { buildHomePresentation, sourceOf } from "@/lib/professional-identity/home-presentation";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { supabase } from "@/integrations/supabase/client";
import { listAssessmentRuns } from "@/lib/journey/journey.functions";
import {
  getMyLinkableAssignments,
  claimAssessmentAssignment,
} from "@/lib/job-intelligence/assessment-assignments.functions";
import { listMyApplications } from "@/lib/job-intelligence/applications.functions";
import { listMyInterviews } from "@/lib/interview-intelligence/candidate.functions";
import { listMyAcademyWork } from "@/lib/security-competency/academy-learning.functions";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import type { CareerProfileForJobsV1 } from "@/lib/career-intelligence-engine/profile-for-jobs";
import { c, L, type Copy } from "@/components/professional-identity/copy";
import { ACTIVE_WORK, EXPLORE } from "@/components/professional-identity/home-copy";

/**
 * /my-career — the personal home.
 *
 * ONE PERSON → ONE PROFESSIONAL IDENTITY → ONE MOST IMPORTANT NEXT STEP.
 *
 * The page is a composition of existing reads handed to ONE presentation
 * model (`buildHomePresentation`), which in turn reads the existing
 * deterministic next-best-action engine. Every product still answers its
 * own query; what changed is that no product speaks for itself on this
 * page any more. The model decides where each fact is shown and shows it
 * once:
 *
 *   CompactGreeting     who this is, in their own words
 *   PriorityWorkspace   the engine's top action + at most two statuses
 *   CareerSnapshot      four destinations, one status each
 *   RecentActivity      the last three things that happened, once
 *   ActiveWork          only what is genuinely in progress
 *   ExploreAndGrow      the career tools, below everything that needs them
 *
 * No new scoring, no schema changes, no second engine. A read that fails
 * degrades its own section and is reported as unreadable, never as zero.
 */

export const Route = createFileRoute("/_authenticated/my-career/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Career — CQrityjob" },
      {
        name: "description",
        content:
          "Your personal career home — the most important next step, your Security Passport, career analysis, assessments and jobs.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyCareerPage,
});

const COPY = {
  greeting: c("Välkommen tillbaka", "Welcome back"),
  lede: c(
    "Här är det viktigaste i din karriär just nu.",
    "Here is what matters most in your career right now.",
  ),
  identityFailed: c(
    "Din profil kunde inte hämtas just nu. Ingenting har tagits bort.",
    "Your profile could not be loaded right now. Nothing has been removed.",
  ),
  retry: c("Försök igen", "Try again"),
  loadingWorkspace: c("Hämtar det viktigaste just nu…", "Loading what matters most…"),
  relevantJobs: c("Relevanta roller", "Relevant roles"),
  noRelevantJobs: c(
    "Vi har inga relevanta roller att visa just nu.",
    "We have no relevant roles to show right now.",
  ),
  allJobs: c("Se alla jobb", "See all jobs"),
  journeySummary: c("Kom igång – visa var du står", "Get started – see where you stand"),
} as const;

function pickTopFamily(profile: CareerProfileForJobsV1) {
  return Object.entries(profile.familyScores)
    .sort(([, a], [, b]) => (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2)
    .map(([id]) => id)[0];
}

function MyCareerPage() {
  const { lang, t } = useT();
  const say = (v: Copy) => L(v, lang);
  const [displayName, setDisplayName] = useState<string>("");

  // ── WHO AM I, WHAT DO I HAVE, WHAT NEXT ───────────────────────────────
  //
  // One read across the products, assembled server-side by the
  // Professional Identity seam. Deliberately NOT gating the rest of the
  // page: a failed read here costs the greeting and the workspace, and the
  // four destinations still render from their own state.
  const loadIdentity = useServerFn(getMyProfessionalIdentity);
  const identityQ = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => loadIdentity(),
    staleTime: 60_000,
    retry: 1,
  });

  // Saved CVs, as a SIGNAL rather than part of the identity read model --
  // see NextBestActionSignals for why the seam deliberately does not carry
  // this.
  const loadCvs = useServerFn(listMyCvs);
  const cvsQ = useQuery({
    queryKey: ["cv", "list"],
    queryFn: () => loadCvs(),
    staleTime: 60_000,
    retry: 1,
  });

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
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Can THIS candidate actually open the assessment? ──────────────────
  //
  // The SAME two questions the assessment route asks, in the same order,
  // so this page never offers a door the product will refuse to open. The
  // gate itself is deliberate (v31-public.functions.ts) and untouched here.
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const assessmentOpenQ = useQuery({
    queryKey: ["my-career", "assessment-open"],
    queryFn: async () => {
      const availability = await checkAvailability({});
      if (!availability.available) return false;
      const status = await checkTesterStatus({});
      return status.allowed;
    },
    staleTime: 60_000,
  });
  // Undefined while loading. Treated as "not open" ONLY for enabling a CTA —
  // never for showing the closed notice — so a slow query cannot flash a
  // "closed" message at a candidate who may in fact be allowed in.
  const assessmentOpen = assessmentOpenQ.data;
  const assessmentClosed = assessmentOpenQ.data === false;

  const fetchRuns = useServerFn(listAssessmentRuns);
  // ONE selection point, resolved on the server before the summary renders.
  const activeFn = useServerFn(getActiveCareerReport);
  const activeQ = useQuery({
    queryKey: ["my-career", "active-report"],
    queryFn: () => activeFn({}),
    staleTime: 60_000,
  });
  const activeIsDiscovery = isRenderableDiscovery(activeQ.data);
  // A v3 report this build cannot read. Shown explicitly — never degraded
  // into an empty-looking report, and never replaced by a legacy one.
  const activeIsUnreadable = activeQ.data?.kind === "discovery_unreadable";
  // Legacy renders ONLY when it is genuinely the active report — never as a
  // fallback while v3 is still loading, has failed, or is unreadable.
  const activeIsLegacy = activeQ.data?.kind === "legacy_v21";

  const runsQ = useQuery({
    queryKey: ["my-career", "runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
  });

  // Employer-assigned assessments completed before this account existed,
  // matched by verified email, not yet linked -- surfaced so linking is
  // always an explicit, signed-in action, never automatic.
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
      qc.invalidateQueries({ queryKey: ["academy", "my-work"] });
      qc.invalidateQueries({ queryKey: ["professional-identity"] });
    },
  });

  // Each of these is non-critical: a backend that is briefly unavailable
  // degrades one figure, never the home, hence retry: false. What it must
  // NOT do is degrade into a zero -- the presentation model carries each
  // read's state and says "could not be read" instead.
  const fetchMyApplications = useServerFn(listMyApplications);
  const fetchMyInterviews = useServerFn(listMyInterviews);
  const myApplicationsQ = useQuery({
    queryKey: ["my-career", "applications"],
    queryFn: () => fetchMyApplications(),
    staleTime: 30_000,
    retry: false,
  });
  // The candidate's own interviews, as the coarse projection the database
  // builds (scp_iv_candidate_interview_status).
  const myInterviewsQ = useQuery({
    queryKey: ["my-career", "interviews"],
    queryFn: () => fetchMyInterviews(),
    retry: false,
  });

  // Everything an employer has asked of this person. Same query key the
  // assessments area uses, so the two share one request.
  const fetchAcademyWork = useServerFn(listMyAcademyWork);
  const academyWorkQ = useQuery({
    queryKey: ["academy", "my-work"],
    queryFn: () => fetchAcademyWork(),
    retry: false,
  });

  // ── DECISIONS THE CANDIDATE HAS NOT SEEN ────────────────────────────
  //
  // The same read the Passport uses, and deliberately the same derivation.
  // The failure is REPORTED rather than rendered as "nothing waiting",
  // which is the whole point of VERIFICATION_ATTENTION_UNAVAILABLE.
  const fetchVerifications = useServerFn(listMyVerificationRequests);
  const verificationsQ = useQuery({
    queryKey: ["passport", "my-verification-requests"],
    queryFn: () => fetchVerifications(),
    staleTime: 60_000,
    retry: false,
  });
  const verificationAttention = verificationsQ.data
    ? deriveVerificationAttention(verificationsQ.data.requests)
    : verificationsQ.isError
      ? VERIFICATION_ATTENTION_UNAVAILABLE
      : null;

  // Relevant roles: the same profile-driven family filter the jobs surface
  // uses. Self-reported, and a suggestion, so it lives at the bottom.
  const profileState = useCareerProfileForJobs();
  const profile = profileState.status === "ready" ? profileState.data.profile : undefined;
  const topFamilyId = profile ? pickTopFamily(profile) : undefined;
  const jobsQ = useQuery({
    queryKey: ["my-career", "jobs", topFamilyId ?? "all"],
    queryFn: () => listPublicJobs({ familyId: topFamilyId, limit: 3 }),
    staleTime: 60_000,
  });

  const latestRun = runsQ.data?.[0];
  // A newer v3 completion must never be overwritten by legacy state: a
  // candidate whose only assessment is v3 has no legacy run and no legacy
  // profile, and must still count as having completed an assessment.
  const noAssessment =
    !activeIsDiscovery &&
    activeQ.status !== "pending" &&
    runsQ.status === "success" &&
    (runsQ.data.length === 0 || profileState.status === "no_profile");
  const legacyRun = activeIsLegacy && latestRun && latestRun.id ? latestRun : null;

  // ── The Career Analysis card's state, every contract named ────────────
  const analysis: CareerAnalysisState = activeQ.isLoading
    ? { kind: "loading" }
    : activeQ.isError
      ? {
          kind: "error",
          // Sanitised, and deliberately NOT a silent fall back to an older
          // legacy report presented as current.
          message: t("careerDiscovery.dashboard.error"),
          onRetry: () => void activeQ.refetch(),
        }
      : activeIsUnreadable && activeQ.data?.kind === "discovery_unreadable"
        ? {
            kind: "unreadable",
            title: t("careerDiscovery.dashboard.unreadableTitle"),
            completedAt: activeQ.data.generatedAt,
          }
        : activeQ.data?.kind === "discovery_v3_0" || activeQ.data?.kind === "discovery_v3_1"
          ? {
              kind: "ready",
              href: `/security-career-assessment/report/${activeQ.data.snapshotId}`,
              completedAt: activeQ.data.generatedAt,
            }
          : legacyRun
            ? {
                kind: "ready",
                href: `/my-career/reports/${legacyRun.id}`,
                completedAt: legacyRun.completed_at ?? legacyRun.started_at,
              }
            : noAssessment
              ? { kind: "none", closed: assessmentClosed }
              : { kind: "loading" };

  // ── ONE presentation model ──────────────────────────────────────────
  const identity = identityQ.data;
  const presentation = useMemo(
    () =>
      identity
        ? buildHomePresentation({
            identity,
            verificationAttention,
            assignments: sourceOf(academyWorkQ.data, academyWorkQ.isError),
            interviews: sourceOf(myInterviewsQ.data, myInterviewsQ.isError),
            applications: sourceOf(myApplicationsQ.data, myApplicationsQ.isError),
            savedCvCount: cvsQ.data?.length,
            careerDiscoveryOpen: assessmentOpen,
            now: new Date(),
          })
        : null,
    [
      identity,
      verificationAttention,
      academyWorkQ.data,
      academyWorkQ.isError,
      myInterviewsQ.data,
      myInterviewsQ.isError,
      myApplicationsQ.data,
      myApplicationsQ.isError,
      cvsQ.data,
      assessmentOpen,
    ],
  );

  // Titles for verification items come from the identity seam this page
  // already loaded, so no second Passport read is needed to name an entry.
  const titleOf = (subject: { kind: "claim" | "experience"; id: string }): string => {
    if (!identity) return say(ACTIVE_WORK.entryFallback);
    if (subject.kind === "claim") {
      return (
        identity.claims.find((cl) => cl.id === subject.id)?.title ?? say(ACTIVE_WORK.entryFallback)
      );
    }
    const p = identity.employment.find((e) => e.id === subject.id);
    return p ? `${p.roleTitle} · ${p.employerName}` : say(ACTIVE_WORK.entryFallback);
  };

  const firstName = displayName.trim().split(/\s+/)[0] ?? "";
  const linkableTasks = linkableQ.data ?? [];

  return (
    <SiteLayout>
      {/* `Section` defaults to the marketing pages' rhythm; a home is not read
          that way. ~1240px is the brief's width for a 12-column workspace. */}
      <Section className="py-8 md:py-10" containerClassName="max-w-[1240px]">
        {/* ---------------- Who am I ---------------- */}
        {identity ? (
          <ProfessionalIdentityHeader
            identity={identity}
            variant="compact"
            profileComplete={presentation?.profileComplete ?? false}
            onRetry={() => void identityQ.refetch()}
          />
        ) : identityQ.isError ? (
          /* The read failed. Stated, with a retry, and scoped to this block:
             the four destinations below still render. */
          <header>
            <h1
              className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {say(COPY.greeting)}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p role="alert" className="mt-2 text-sm text-destructive">
              {say(COPY.identityFailed)}
            </p>
            <button
              type="button"
              onClick={() => void identityQ.refetch()}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {say(COPY.retry)}
            </button>
          </header>
        ) : (
          <header>
            <h1
              className="text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {say(COPY.greeting)}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1.5 text-base text-muted-foreground">{say(COPY.lede)}</p>
          </header>
        )}

        {/* ---------------- What matters most ---------------- */}
        {presentation ? (
          <div className="mt-8">
            <NextActions workspace={presentation.workspace} />
          </div>
        ) : identityQ.isLoading ? (
          <div className="mt-8" role="status" aria-live="polite">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {say(COPY.loadingWorkspace)}
            </p>
            <div className="mt-3 h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
        ) : null}

        {/* ---------------- Four destinations ---------------- */}
        <div className="mt-8">
          <CareerSnapshot
            snapshot={
              presentation?.snapshot ?? {
                passport: { state: "unavailable" },
                assessments: { state: "unavailable" },
                jobs: { state: "unavailable" },
              }
            }
            analysis={analysis}
          />
        </div>

        {/* ---------------- What happened ---------------- */}
        {presentation && <RecentActivity activity={presentation.activity} className="mt-8" />}

        {/* ---------------- What is in progress ---------------- */}
        {presentation && (
          <ActiveWork items={presentation.activeWork} titleOf={titleOf} className="mt-8">
            {/* Employer-assigned assessments completed before sign-in,
                matched by verified email, offered for explicit linking. A
                one-off housekeeping action for a small minority of accounts,
                rendered only when there is genuinely something to link. */}
            {linkableTasks.length > 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {say(ACTIVE_WORK.linkEarlierTitle)}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {say(ACTIVE_WORK.linkEarlierBody)}
                </p>
                <ul className="mt-2 divide-y divide-border">
                  {linkableTasks.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-foreground">
                        {lang === "sv" ? a.assessmentNameSv : a.assessmentNameEn}
                      </span>
                      <button
                        type="button"
                        disabled={claimMutation.isPending}
                        onClick={() => claimMutation.mutate(a.id)}
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {say(ACTIVE_WORK.linkEarlierCta)}
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ActiveWork>
        )}

        {/* ---------------- Build on your career ---------------- */}
        {presentation && (
          <ExploreAndGrow items={presentation.explore} className="mt-10">
            {/* Relevant roles, from the same family filter the jobs surface
                uses. A compact list or a compact empty state; the destination
                stays useful either way. Omitted while loading or failed --
                a suggestion that could not be computed is not a fact about
                this person's job search. */}
            {jobsQ.isSuccess && (
              <div className="mt-6" data-relevant-jobs>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {say(COPY.relevantJobs)}
                </h3>
                {jobsQ.data.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border border-t border-border">
                    {jobsQ.data.map((j) => {
                      const title =
                        (lang === "sv" ? j.title_sv : j.title_en) || j.title_en || j.title_sv || "";
                      const location =
                        [j.location_text, j.city, j.country].filter(Boolean).join(", ") || "";
                      return (
                        <li key={j.id}>
                          <Link
                            to="/jobs/$slug"
                            params={{ slug: j.slug }}
                            className="group flex min-h-11 flex-col justify-center py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="text-sm font-medium text-balance text-foreground group-hover:underline">
                              {title}
                            </span>
                            {location && (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {location}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {say(COPY.noRelevantJobs)}{" "}
                    <Link
                      to="/jobs"
                      className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {say(COPY.allJobs)}
                    </Link>
                  </p>
                )}
              </div>
            )}

            {/* ── The onboarding journey, for an account that has not started ──
                Five stages, one sentence each, derived from the identity read
                model this page already has. Collapsed, and only for a new
                account: an established person has moved past it, and a
                permanent five-step strip repeated what every other section
                already said. */}
            {presentation.showJourney && (
              <details className="mt-6 rounded-xl border border-border bg-card p-4">
                <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {say(COPY.journeySummary)}
                </summary>
                <CareerJourney identity={identity!} className="mt-3" />
              </details>
            )}

            {/* Previous legacy reports stay reachable. Unchanged component,
                unchanged destinations, rendered from the SAME runsQ data. */}
            {runsQ.data && runsQ.data.length > 1 && (
              <details className="mt-6 rounded-xl border border-border bg-card p-4">
                <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {say(EXPLORE.allReports)}
                </summary>
                <div className="mt-3">
                  <ReportHistoryList legacyRuns={runsQ.data.slice(1) as never} />
                </div>
              </details>
            )}
          </ExploreAndGrow>
        )}
      </Section>
    </SiteLayout>
  );
}
