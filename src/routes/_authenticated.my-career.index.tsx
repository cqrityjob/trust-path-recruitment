import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import {
  getActiveCareerReport,
  isRenderableDiscovery,
} from "@/lib/career-discovery/active-report.functions";
import { getStoredDiscoveryReport } from "@/lib/career-discovery/stored-report.functions";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";
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
import { EmployerProcesses } from "@/components/professional-identity/EmployerProcesses";
import { DevelopmentSection } from "@/components/professional-identity/DevelopmentSection";
import { CareerTools } from "@/components/professional-identity/CareerTools";
import { RecentActivity } from "@/components/professional-identity/RecentActivity";
import { LinkEarlierResult } from "@/components/professional-identity/LinkEarlierResult";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
} from "@/lib/professional-identity/verification-attention";
import {
  buildCareerHomeViewModel,
  sourceOf,
  type IdentityInput,
  type JobFilterInput,
} from "@/lib/professional-identity/home-presentation";
import { useNextActionAnalytics } from "@/lib/professional-identity/next-action-analytics";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { supabase } from "@/integrations/supabase/client";
import { getMyLinkableAssignments } from "@/lib/job-intelligence/assessment-assignments.functions";
import { listMyApplications } from "@/lib/job-intelligence/applications.functions";
import { listMyInterviews } from "@/lib/interview-intelligence/candidate.functions";
import {
  claimAssessmentInvitations,
  listAcademyWork,
} from "@/lib/security-competency/academy-training.functions";
import { getMyAssessmentHistory } from "@/lib/security-competency/assessment-lifecycle.functions";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import type { CareerProfileForJobsV1 } from "@/lib/career-intelligence-engine/profile-for-jobs";
import { L, type Copy } from "@/components/professional-identity/copy";
import { CAREER } from "@/components/professional-identity/home-copy";

/**
 * /my-career — the personal career home.
 *
 * ONE PERSON → ONE PROFESSIONAL IDENTITY → ONE MOST IMPORTANT NEXT STEP.
 *
 * Three questions, answered in this order, above the fold: who am I in the
 * security industry (CareerPageHeader), what is my one most useful step
 * (NextBestAction), and what has actually been established about me
 * (PassportSummary). The Passport is the durable evidence layer; tests,
 * results, training and applications are processes around it, laid out
 * further down as rows.
 *
 * ── ONE VIEW MODEL, EVERY SOURCE ON ITS OWN ────────────────────────────
 *
 * Every section reads `buildCareerHomeViewModel`. Each query below carries
 * its own state into it, so a failed read costs one section — never the
 * page — and a skeleton only ever means "still loading". The identity read
 * is not a gate: with it failed, the header says so with a retry and the
 * sections fed by other reads still render.
 *
 * ── THE SAME READS THE DESTINATIONS USE ────────────────────────────────
 *
 * Tests and training come from the SAME two calls /academy makes — claim
 * any invitation addressed to this person's confirmed email, then list the
 * canonical work — so an emailed invitation appears on this visit, and what
 * the home shows is what the destination shows. Pipeline states come from
 * the participant's own history read, which is the lifecycle's source.
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
  const qc = useQueryClient();

  // The name the person set for themselves — `display_name` or `name` from
  // the session metadata, never an email local part. The model falls back
  // to the account's first name, then to no name.
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

  // ── WHO AM I, WHAT DO I HAVE ────────────────────────────────────────
  const loadIdentity = useServerFn(getMyProfessionalIdentity);
  const identityQ = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => loadIdentity(),
    staleTime: 60_000,
    retry: 1,
  });

  const loadCvs = useServerFn(listMyCvs);
  const cvsQ = useQuery({
    queryKey: ["cv", "list"],
    queryFn: () => loadCvs(),
    staleTime: 60_000,
    retry: 1,
  });

  // ── Can THIS candidate actually open the career analysis? ───────────
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
  const assessmentOpen = assessmentOpenQ.data;
  const assessmentClosed = assessmentOpenQ.data === false;

  // ── THE CAREER PICTURE, FROM THE FROZEN REPORT ──────────────────────
  const activeFn = useServerFn(getActiveCareerReport);
  // One retry, like the identity read. The default three with backoff kept
  // the career section a skeleton for ~7s after a failed read, which reads
  // as a permanent skeleton to anybody waiting on it.
  const activeQ = useQuery({
    queryKey: ["my-career", "active-report"],
    queryFn: () => activeFn({}),
    staleTime: 60_000,
    retry: 1,
  });
  const activeSnapshotId = isRenderableDiscovery(activeQ.data) ? activeQ.data.snapshotId : null;
  const loadStoredReport = useServerFn(getStoredDiscoveryReport);
  const storedReportQ = useQuery({
    queryKey: ["my-career", "stored-report", activeSnapshotId],
    queryFn: () => loadStoredReport({ data: { snapshotId: activeSnapshotId! } }),
    enabled: Boolean(activeSnapshotId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Earlier analyses: legacy v2.1 runs AND v3 reports, both read here so
  // the disclosure is rendered only when at least one genuine earlier
  // report exists — never opened onto an empty list, never listing the
  // current report as "earlier". Same query key as the history list, so
  // the list's own read is served from cache.
  const fetchRuns = useServerFn(listAssessmentRuns);
  const runsQ = useQuery({
    queryKey: ["my-career", "runs"],
    queryFn: () => fetchRuns(),
    staleTime: 30_000,
    retry: false,
  });
  const fetchDiscoveryReports = useServerFn(listMyDiscoveryReports);
  const discoveryReportsQ = useQuery({
    queryKey: ["career-discovery", "my-reports"],
    queryFn: () => fetchDiscoveryReports({}),
    staleTime: 30_000,
    retry: false,
  });

  // ── EMPLOYER PROCESSES — the canonical academy reads ───────────────
  //
  // The same orchestration as /academy: the list starts at once (never
  // gated on the claim, which would render as a failure on first paint),
  // the claim runs alongside, and the list is refetched only if the claim
  // actually bound something. Somebody invited by email before they had an
  // account sees the test on THIS visit.
  const listWork = useServerFn(listAcademyWork);
  const academyWorkQ = useQuery({
    queryKey: ["academy", "work"],
    queryFn: () => listWork(),
    retry: false,
  });
  const claimInvitations = useServerFn(claimAssessmentInvitations);
  const claimQ = useQuery({
    queryKey: ["academy", "claim-invitations"],
    queryFn: () => claimInvitations(),
    staleTime: Infinity,
    retry: false,
  });
  const bound = claimQ.data?.bound ?? 0;
  const refetchWork = academyWorkQ.refetch;
  useEffect(() => {
    if (bound > 0) void refetchWork();
  }, [bound, refetchWork]);

  // The participant's own pipeline states. This is what decides whether a
  // test is waiting on the employer, released, or something else.
  const fetchHistory = useServerFn(getMyAssessmentHistory);
  const historyQ = useQuery({
    queryKey: ["academy", "my-history"],
    queryFn: () => fetchHistory(),
    retry: false,
  });

  // Tests completed before this account existed, matched by verified
  // email, offered for explicit linking. A successful link refreshes every
  // read the linked test appears in.
  const fetchLinkable = useServerFn(getMyLinkableAssignments);
  const linkableQ = useQuery({
    queryKey: ["my-career", "linkable-assignments"],
    queryFn: () => fetchLinkable(),
    staleTime: 30_000,
    retry: false,
  });
  const onLinked = () => {
    void qc.invalidateQueries({ queryKey: ["academy", "work"] });
    void qc.invalidateQueries({ queryKey: ["academy", "my-history"] });
    void qc.invalidateQueries({ queryKey: ["professional-identity"] });
    void qc.invalidateQueries({ queryKey: ["my-career", "linkable-assignments"] });
  };

  // ── APPLICATIONS AND INTERVIEWS ─────────────────────────────────────
  const fetchMyApplications = useServerFn(listMyApplications);
  const myApplicationsQ = useQuery({
    queryKey: ["my-career", "applications"],
    queryFn: () => fetchMyApplications(),
    staleTime: 30_000,
    retry: false,
  });
  const fetchMyInterviews = useServerFn(listMyInterviews);
  const myInterviewsQ = useQuery({
    queryKey: ["my-career", "interviews"],
    queryFn: () => fetchMyInterviews(),
    retry: false,
  });

  // ── VERIFICATION STATE — the same read the Passport uses ───────────
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

  // ── OPEN ROLES — filtered by the career analysis, or not at all ─────
  //
  // The family comes from the career analysis (assessment_runs.result_
  // summary), and from nowhere else. With no analysis there is no filter,
  // and the newest vacancies are shown under a sentence that says so.
  const profileState = useCareerProfileForJobs();
  const jobFilter: JobFilterInput =
    profileState.status === "loading"
      ? { state: "loading" }
      : profileState.status === "ready"
        ? { state: "family", familyId: pickTopFamily(profileState.data.profile) ?? "" }
        : { state: "none" };
  const familyId =
    jobFilter.state === "family" && jobFilter.familyId ? jobFilter.familyId : undefined;
  const jobsQ = useQuery({
    queryKey: ["my-career", "jobs", familyId ?? "all"],
    queryFn: () => listPublicJobs({ familyId, limit: 3 }),
    enabled: jobFilter.state !== "loading",
    staleTime: 60_000,
    retry: false,
  });

  // ── ONE VIEW MODEL ──────────────────────────────────────────────────
  const identityInput: IdentityInput = identityQ.data
    ? { state: "ready", identity: identityQ.data }
    : identityQ.isError
      ? { state: "error" }
      : { state: "loading" };
  const model = useMemo(
    () =>
      buildCareerHomeViewModel({
        identity: identityInput,
        verificationAttention,
        academyWork: sourceOf(academyWorkQ.data, academyWorkQ.isError),
        assessmentHistory: sourceOf(historyQ.data, historyQ.isError),
        interviews: sourceOf(myInterviewsQ.data, myInterviewsQ.isError),
        applications: sourceOf(myApplicationsQ.data, myApplicationsQ.isError),
        jobFilter,
        jobs: sourceOf(jobsQ.data, jobsQ.isError),
        activeReport: activeQ.data,
        activeReportError: activeQ.isError,
        storedReport: storedReportQ.data,
        storedReportError: storedReportQ.isError,
        legacyRuns: sourceOf(runsQ.data as never, runsQ.isError),
        discoveryReports: sourceOf(discoveryReportsQ.data?.reports, discoveryReportsQ.isError),
        preferredName,
        savedCvCount: cvsQ.data?.length,
        careerDiscoveryOpen: assessmentOpen,
        now: new Date(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every query's data and error state is listed
    [
      identityQ.data,
      identityQ.isError,
      verificationAttention,
      academyWorkQ.data,
      academyWorkQ.isError,
      historyQ.data,
      historyQ.isError,
      myInterviewsQ.data,
      myInterviewsQ.isError,
      myApplicationsQ.data,
      myApplicationsQ.isError,
      profileState.status,
      familyId,
      jobsQ.data,
      jobsQ.isError,
      activeQ.data,
      activeQ.isError,
      storedReportQ.data,
      storedReportQ.isError,
      runsQ.data,
      runsQ.isError,
      discoveryReportsQ.data,
      discoveryReportsQ.isError,
      preferredName,
      cvsQ.data,
      assessmentOpen,
    ],
  );

  // ── MEASUREMENT — one impression per state ──────────────────────────
  const analytics = useNextActionAnalytics();
  const seenStateKey = useRef<string | null>(null);
  const stateKey =
    model.nextAction.state === "ready" ? (model.nextAction.primary?.action.stateKey ?? null) : null;
  useEffect(() => {
    if (!stateKey || seenStateKey.current === stateKey) return;
    seenStateKey.current = stateKey;
    analytics.impression(stateKey);
  }, [stateKey, analytics]);

  const retryIdentity = () => void identityQ.refetch();
  const analysisHref =
    model.career.state === "ready" || model.career.state === "legacy"
      ? model.career.reportHref
      : null;

  return (
    <SiteLayout>
      <Section className="py-8 md:py-10" containerClassName="max-w-[1240px]">
        {/* 1 · Who am I */}
        <CareerPageHeader profile={model.profile} onRetry={retryIdentity} />

        {/* 2 · The one next step, 3 · the Passport — two columns on desktop,
            one column at 375 in source order. */}
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <NextBestAction
              next={model.nextAction}
              onRetry={retryIdentity}
              onPrimaryClick={(key, destination) => analytics.click(key as never, destination)}
            />
          </div>
          <div className="lg:col-span-5">
            <PassportSummary
              passport={model.passport}
              onRetry={() => {
                void identityQ.refetch();
                void verificationsQ.refetch();
              }}
            />
          </div>
        </div>

        {/* 4 · Where this career could go */}
        <CareerDirectionSection
          career={model.career}
          closed={assessmentClosed}
          onRetry={() => {
            void activeQ.refetch();
            void storedReportQ.refetch();
          }}
          className="mt-10"
        >
          {model.earlierReports.state === "ready" && model.earlierReports.count > 0 && (
            <details className="mt-4 border-t border-border pt-2" data-earlier-reports>
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {say(CAREER.earlier)} ({model.earlierReports.count})
              </summary>
              <div className="mt-2">
                <ReportHistoryList
                  legacyRuns={model.earlierReports.legacyRuns as never}
                  discoveryReports={model.earlierReports.discoveryReports}
                />
              </div>
            </details>
          )}
        </CareerDirectionSection>

        {/* 5 · Open roles */}
        <JobRecommendations
          jobs={model.jobs}
          analysisHref={analysisHref}
          onRetry={() => void jobsQ.refetch()}
          className="mt-10"
        />

        {/* 6 · Applications, tests and results */}
        <EmployerProcesses
          applications={model.applications}
          work={model.employerWork}
          onRetryApplications={() => void myApplicationsQ.refetch()}
          onRetryWork={() => {
            void academyWorkQ.refetch();
            void historyQ.refetch();
          }}
          className="mt-10"
        >
          <LinkEarlierResult rows={linkableQ.data ?? []} onLinked={onLinked} />
        </EmployerProcesses>

        {/* 7 · Training and development — only when there is any */}
        <DevelopmentSection work={model.employerWork} className="mt-10" />

        {/* 8 · Career tools */}
        <CareerTools tools={model.tools} className="mt-10" />

        {/* 9 · What happened */}
        <RecentActivity activity={model.activity} className="mt-10" />
      </Section>
    </SiteLayout>
  );
}
