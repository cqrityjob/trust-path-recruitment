import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import {
  getActiveCareerReport,
  isRenderableDiscovery,
} from "@/lib/career-discovery/active-report.functions";
import { getStoredDiscoveryReport } from "@/lib/career-discovery/stored-report.functions";
import { ReportHistoryList } from "@/components/career-discovery/ReportHistoryList";
import { listAssessmentRuns } from "@/lib/journey/journey.functions";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";
import { useT } from "@/i18n/context";
import { CareerPageHeader } from "@/components/professional-identity/CareerPageHeader";
import { NextBestAction } from "@/components/professional-identity/NextBestAction";
import { PassportSummary } from "@/components/professional-identity/PassportSummary";
import { CareerDirectionSection } from "@/components/professional-identity/CareerDirectionSection";
import { JobRecommendations } from "@/components/professional-identity/JobRecommendations";
import { ApplicationsAndResults } from "@/components/professional-identity/ApplicationsAndResults";
import { CareerTools } from "@/components/professional-identity/CareerTools";
import { RecentActivity } from "@/components/professional-identity/RecentActivity";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
} from "@/lib/professional-identity/verification-attention";
import { buildCareerHomeViewModel, sourceOf } from "@/lib/professional-identity/home-presentation";
import { useNextActionAnalytics } from "@/lib/professional-identity/next-action-analytics";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { supabase } from "@/integrations/supabase/client";
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
import { L, type Copy } from "@/components/professional-identity/copy";
import { CAREER, LINK_EARLIER, NEXT_ACTION } from "@/components/professional-identity/home-copy";

/**
 * /my-career — the personal career home.
 *
 * ONE PERSON → ONE PROFESSIONAL IDENTITY → ONE MOST IMPORTANT NEXT STEP.
 *
 * ── WHAT THE PAGE IS ABOUT ─────────────────────────────────────────────
 *
 * Three questions, answered in this order, above the fold:
 *
 *   who am I in the security industry     CareerPageHeader
 *   what is my single most useful step    NextBestAction
 *   what has been established about me    PassportSummary
 *
 * The Security Passport is the candidate's long-term evidence layer.
 * Assessments, reports and applications are temporary processes AROUND
 * that, and they are laid out that way: the Passport sits beside the
 * recommendation at the top; an employer's assessment report is a row in
 * an ordinary operational section further down, not the page's hero.
 *
 * ── ONE VIEW MODEL ─────────────────────────────────────────────────────
 *
 * Every section reads `buildCareerHomeViewModel`. Each product still
 * answers its own query — this page adds no database source — but no
 * product speaks for itself here any more: the model decides where each
 * fact is shown and shows it ONCE. That is what stops the page saying "0
 * verified" in one place and "a merit was verified" in another.
 *
 * ── AND A FAILED READ IS NEVER A ZERO ──────────────────────────────────
 *
 * Each read's state travels into the model, and the sections say "could
 * not be read" rather than printing a number nobody established.
 */

export const Route = createFileRoute("/_authenticated/my-career/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Career — CQrityjob" },
      {
        name: "description",
        content:
          "Your personal career home — your merits, your Security Passport, your career direction and your next step.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyCareerPage,
});

function pickTopFamily(profile: CareerProfileForJobsV1) {
  return Object.entries(profile.familyScores)
    .sort(([, a], [, b]) => (b.currentFit + b.potential) / 2 - (a.currentFit + a.potential) / 2)
    .map(([id]) => id)[0];
}

function MyCareerPage() {
  const { lang } = useT();
  const say = (v: Copy) => L(v, lang);

  /**
   * The name the person set for themselves.
   *
   * `display_name` or `name` from the account metadata, and NOTHING else.
   * The email local part used to stand in for a missing name, which greeted
   * people as "sandleradam191" — a string they never offered as a name. The
   * view model falls back to the account's first name, then to no name.
   */
  const [preferredName, setPreferredName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const nm =
        (typeof meta.display_name === "string" && meta.display_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        null;
      setPreferredName(nm || null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── WHO AM I, WHAT DO I HAVE, WHAT NEXT ───────────────────────────────
  //
  // One read across the products, assembled server-side by the
  // Professional Identity seam. Deliberately NOT gating the rest of the
  // page: a failed read here costs the header and the recommendation, and
  // the sections below still render from their own state.
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

  // ── Can THIS candidate actually open the career analysis? ─────────────
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

  // ONE selection point, resolved on the server before anything renders.
  const activeFn = useServerFn(getActiveCareerReport);
  const activeQ = useQuery({
    queryKey: ["my-career", "active-report"],
    queryFn: () => activeFn({}),
    staleTime: 60_000,
  });

  // ── THE CAREER PICTURE COMES FROM THE FROZEN REPORT ───────────────────
  //
  // The occupation the analysis recommended is IN the stored snapshot, and
  // this reads it there rather than recomputing it — a dashboard that
  // recomputed would eventually disagree with the report it links to. One
  // extra round trip, only for somebody who HAS a readable report, through
  // the same owner-scoped server function the report page itself uses.
  const activeSnapshotId = isRenderableDiscovery(activeQ.data) ? activeQ.data.snapshotId : null;
  const loadStoredReport = useServerFn(getStoredDiscoveryReport);
  const storedReportQ = useQuery({
    queryKey: ["my-career", "stored-report", activeSnapshotId],
    queryFn: () => loadStoredReport({ data: { snapshotId: activeSnapshotId! } }),
    enabled: Boolean(activeSnapshotId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Legacy v2.1 runs. Still read, and for two reasons: `getActiveCareerReport`
  // can name a legacy report as the CURRENT one, and the earlier ones stay
  // reachable from the career section rather than from the full-width "all my
  // reports" panel this page used to render empty at the bottom.
  const fetchRuns = useServerFn(listAssessmentRuns);
  const runsQ = useQuery({
    queryKey: ["my-career", "runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
    retry: false,
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
      qc.invalidateQueries({ queryKey: ["my-career", "linkable-assignments"] });
      qc.invalidateQueries({ queryKey: ["academy", "my-work"] });
      qc.invalidateQueries({ queryKey: ["professional-identity"] });
    },
  });

  // Each of these is non-critical: a backend that is briefly unavailable
  // degrades one figure, never the home, hence retry: false. What it must
  // NOT do is degrade into a zero -- the view model carries each read's
  // state and says "could not be read" instead.
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
  // tests area uses, so the two share one request.
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

  // Open roles: the same profile-driven family filter the jobs surface
  // uses. Stated as such, and never as a personal match.
  const profileState = useCareerProfileForJobs();
  const profile = profileState.status === "ready" ? profileState.data.profile : undefined;
  const topFamilyId = profile ? pickTopFamily(profile) : undefined;
  const jobsQ = useQuery({
    queryKey: ["my-career", "jobs", topFamilyId ?? "all"],
    queryFn: () => listPublicJobs({ familyId: topFamilyId, limit: 3 }),
    staleTime: 60_000,
  });

  // ── ONE VIEW MODEL ──────────────────────────────────────────────────
  const identity = identityQ.data;
  const model = useMemo(
    () =>
      identity
        ? buildCareerHomeViewModel({
            identity,
            verificationAttention,
            assignments: sourceOf(academyWorkQ.data, academyWorkQ.isError),
            interviews: sourceOf(myInterviewsQ.data, myInterviewsQ.isError),
            applications: sourceOf(myApplicationsQ.data, myApplicationsQ.isError),
            jobs: sourceOf(jobsQ.data, jobsQ.isError),
            activeReport: activeQ.data,
            activeReportError: activeQ.isError,
            storedReport: storedReportQ.data,
            storedReportError: storedReportQ.isError,
            preferredName,
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
      jobsQ.data,
      jobsQ.isError,
      activeQ.data,
      activeQ.isError,
      storedReportQ.data,
      storedReportQ.isError,
      preferredName,
      cvsQ.data,
      assessmentOpen,
    ],
  );

  // ── MEASUREMENT ─────────────────────────────────────────────────────
  //
  // One impression per state, not one per render. The state key is the
  // ladder rung plus the action kind and carries nothing about the person;
  // see next-action-analytics.ts, including why nothing is recorded until
  // the funnel allowlist has the two names.
  const analytics = useNextActionAnalytics();
  const seenStateKey = useRef<string | null>(null);
  const stateKey = model?.nextAction?.action.stateKey ?? null;
  useEffect(() => {
    if (!stateKey || seenStateKey.current === stateKey) return;
    seenStateKey.current = stateKey;
    analytics.impression(stateKey);
  }, [stateKey, analytics]);

  const linkableTasks = linkableQ.data ?? [];

  return (
    <SiteLayout>
      {/* `Section` defaults to the marketing pages' rhythm; a home is not read
          that way. ~1240px is the brief's width for a 12-column workspace. */}
      <Section className="py-8 md:py-10" containerClassName="max-w-[1240px]">
        {/* ---------------- 1 · Who am I ---------------- */}
        {model ? (
          <CareerPageHeader profile={model.profile} onRetry={() => void identityQ.refetch()} />
        ) : (
          <CareerPageHeader
            profile={{
              preferredName,
              accountFirstName: null,
              greetingName: preferredName,
              headline: null,
              professionTitleSv: null,
              professionTitleEn: null,
              workCountry: null,
              workSubJurisdiction: null,
              complete: false,
              degraded: identityQ.isError,
            }}
            onRetry={identityQ.isError ? () => void identityQ.refetch() : undefined}
          />
        )}

        {/* ---------------- 2 · The one next step, 3 · the Passport ----------
            Two columns on desktop, both above the fold. On mobile the grid
            collapses to one column in source order: the recommendation
            first, the Passport second. */}
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {model ? (
              <NextBestAction
                next={model.nextAction}
                calm={model.calm}
                onPrimaryClick={(key, destination) => analytics.click(key as never, destination)}
              />
            ) : (
              <div role="status" aria-live="polite">
                <p className="sr-only">{say(NEXT_ACTION.loading)}</p>
                <div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              </div>
            )}
          </div>
          <div className="lg:col-span-5">
            {model ? (
              <PassportSummary passport={model.passport} />
            ) : (
              <div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            )}
          </div>
        </div>

        {model && (
          <>
            {/* ---------------- 4 · Where this career could go ---------------- */}
            <CareerDirectionSection
              career={model.career}
              closed={assessmentClosed}
              className="mt-8"
            >
              {/* Earlier analyses, as a compact disclosure inside the section
                  that is about them. Rendered only when there ARE earlier
                  ones — the panel it replaces was a full-width empty box on
                  every account that had a single report. */}
              {runsQ.data && runsQ.data.length > 1 && (
                <details className="mt-5 border-t border-border pt-3">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {say(CAREER.earlier)}
                  </summary>
                  <div className="mt-3">
                    <ReportHistoryList legacyRuns={runsQ.data.slice(1) as never} />
                  </div>
                </details>
              )}
            </CareerDirectionSection>

            {/* ---------------- 5 · Open roles ---------------- */}
            <JobRecommendations jobs={model.jobs} className="mt-8" />

            {/* ---------------- 6 · Applications, tests and results ---------- */}
            <ApplicationsAndResults
              assessments={model.assessments}
              jobs={model.jobs}
              className="mt-8"
            >
              {/* Employer-assigned assessments completed before sign-in,
                  matched by verified email, offered for explicit linking. A
                  one-off housekeeping action for a small minority of accounts,
                  rendered only when there is genuinely something to link. */}
              {linkableTasks.length > 0 && (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 p-4">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {say(LINK_EARLIER.title)}
                  </h4>
                  <p className="mt-2 text-sm text-muted-foreground">{say(LINK_EARLIER.body)}</p>
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
                          {say(LINK_EARLIER.cta)}
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ApplicationsAndResults>

            {/* ---------------- 7 · Career tools ---------------- */}
            <CareerTools tools={model.tools} className="mt-10" />

            {/* ---------------- 8 · What happened ---------------- */}
            <RecentActivity activity={model.activity} className="mt-10" />
          </>
        )}
      </Section>
    </SiteLayout>
  );
}
