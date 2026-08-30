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
  Eye,
  User as UserIcon,
  MapPin,
  TrendingUp,
  Award,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { SecurityCareerProfileCard } from "@/components/assessment/SecurityCareerProfileCard";
import { MyAcademyWorkCard } from "@/components/academy/MyAcademyWorkCard";
import { MyReviewQueueCard } from "@/components/academy/MyReviewQueueCard";
import { PassportSummaryCard } from "@/components/security-passport/PassportSummaryCard";
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import { ReportHistoryList } from "@/components/career-discovery/ReportHistoryList";
import { DiscoveryCareerSummary } from "@/components/career-discovery/DiscoveryCareerSummary";
import {
  getActiveCareerReport,
  isRenderableDiscovery,
} from "@/lib/career-discovery/active-report.functions";
import {
  DiscoveryReportUnreadable,
  DiscoveryV31Pending,
} from "@/components/career-discovery/DiscoveryReportStates";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";
import { useT } from "@/i18n/context";
import { ProfessionalIdentityHeader } from "@/components/professional-identity/ProfessionalIdentityHeader";
import { NextActions } from "@/components/professional-identity/NextActions";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { supabase } from "@/integrations/supabase/client";
import { listAssessmentRuns } from "@/lib/journey/journey.functions";
import {
  getMyLinkableAssignments,
  claimAssessmentAssignment,
} from "@/lib/job-intelligence/assessment-assignments.functions";
import { listMyApplications } from "@/lib/job-intelligence/applications.functions";
import {
  listMyInterviews,
  type CandidateInterviewStatus,
} from "@/lib/interview-intelligence/candidate.functions";
import { listMyAcademyWork } from "@/lib/security-competency/academy-learning.functions";
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
/**
 * The three states a candidate is told about.
 *
 * `employer_process_continuing` covers four internal states, and the wording is
 * chosen to be honest about that rather than to imply a stalled process: the
 * interview is done and the employer is deciding, which is exactly what is
 * happening and all the candidate is entitled to know.
 */
const CANDIDATE_INTERVIEW_STATUS: Record<CandidateInterviewStatus, { sv: string; en: string }> = {
  interview_offered: {
    sv: "Intervju erbjuden — förbered dig inför intervjun",
    en: "Interview offered — prepare for your interview",
  },
  interview_in_progress: {
    sv: "Intervjun pågår",
    en: "Interview in progress",
  },
  employer_process_continuing: {
    sv: "Intervjun är genomförd. Arbetsgivarens process fortsätter.",
    en: "Interview completed. The employer's process continues.",
  },
};

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

  // ── WHO AM I, WHAT DO I HAVE, WHAT NEXT ───────────────────────────────
  //
  // One read across the five products, assembled server-side by the
  // Professional Identity seam and handed to two pure functions. It answers
  // the three questions this page opens with; everything below it is the
  // existing per-product detail, unchanged.
  //
  // Deliberately NOT gating the rest of the page: a failed read here costs
  // the summary and the suggestions, and the Passport, Career Discovery,
  // jobs and assessment sections still render from their own queries. A
  // dashboard that blanks because one of six reads failed is worse than a
  // dashboard missing its header.
  const loadIdentity = useServerFn(getMyProfessionalIdentity);
  const identityQ = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => loadIdentity(),
    staleTime: 60_000,
    retry: 1,
  });

  // Saved CVs, as a SIGNAL rather than part of the identity read model --
  // see NextBestActionSignals for why the seam deliberately does not carry
  // this. Its own query, its own failure: if it does not answer, the
  // suggestion falls back to "create your CV", which is the honest thing to
  // say when we do not know whether one exists.
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
  // My Career used to link to /security-career-assessment unconditionally, so
  // a candidate outside the internal test group was told "Complete the
  // assessment to unlock recommendations", given a "Start assessment" button,
  // and then shown "The assessment isn't open yet" on arrival. The dead end was
  // not the gate — the gate is deliberate (see v31-public.functions.ts: the
  // content is `active`, but only platform admins and `cd_internal_testers`
  // may run it while the recommendation layer is mid-build). The dead end was
  // this page promising something the product refuses.
  //
  // So ask the SAME two questions the assessment route asks, in the same
  // order, and let the answer decide what this page offers. Deliberately not a
  // hardcoded "closed" notice: when the owner grants tester access the CTAs
  // come back on their own, with no second edit here to forget.
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const assessmentOpenQ = useQuery({
    queryKey: ["my-career", "assessment-open"],
    queryFn: async () => {
      const availability = await checkAvailability({});
      if (!availability.available) return false;
      // This route is inside _authenticated, so there is always a session and
      // the tester check can never be the anonymous case the flow defers.
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
  // Doing this client-side would flash the legacy summary first.
  const activeFn = useServerFn(getActiveCareerReport);
  const activeQ = useQuery({
    queryKey: ["my-career", "active-report"],
    queryFn: () => activeFn({}),
    staleTime: 60_000,
  });
  // Two v3 report contracts now exist and they store genuinely different
  // payloads, so each reaches its own renderer. isRenderableDiscovery() covers
  // both, which is what keeps the legacy branch suppressed for either.
  const activeIsDiscovery = isRenderableDiscovery(activeQ.data);
  // A v3 report this build cannot read. Shown explicitly — never degraded into
  // an empty-looking report, and never replaced by a legacy one.
  const activeIsUnreadable = activeQ.data?.kind === "discovery_unreadable";
  // Legacy renders ONLY when it is genuinely the active report — never as a
  // fallback while v3 is still loading, has failed, or is unreadable.
  const activeIsLegacy = activeQ.data?.kind === "legacy_v21";

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

  // Feeds the "Active applications" figure on the Jobs card. Non-critical:
  // an applications backend that is briefly unavailable must degrade one
  // number, never the dashboard, hence retry: false and no error UI.
  const fetchMyApplications = useServerFn(listMyApplications);
  const fetchMyInterviews = useServerFn(listMyInterviews);
  const myApplicationsQ = useQuery({
    queryKey: ["my-career", "applications"],
    queryFn: () => fetchMyApplications(),
    staleTime: 30_000,
    retry: false,
  });
  // The candidate's own interviews. The status is a coarse projection built in
  // the database (scp_iv_candidate_interview_status): everything after the
  // interview itself collapses into one state, because a candidate watching
  // their case move from evidence review to assessed would be watching the
  // employer deliberate.
  const myInterviewsQ = useQuery({
    queryKey: ["my-career", "interviews"],
    queryFn: () => fetchMyInterviews(),
  });
  const interviews = myInterviewsQ.data ?? [];
  const nextInterview = interviews.find((i) => i.status !== "employer_process_continuing") ?? null;

  // Same query key as MyAcademyWorkCard, so this shares one request.
  const fetchAcademyWork = useServerFn(listMyAcademyWork);
  const academyWorkQ = useQuery({
    queryKey: ["academy", "my-work"],
    queryFn: () => fetchAcademyWork(),
    retry: false,
  });

  // The Passport snapshot for the primary card. Fetched HERE rather than
  // inside PassportSummaryCard because Passport components may not reach the
  // server tier (passport-separation-check.ts, rule 2) — the card is
  // presentational and takes what this route gives it.
  const fetchPassport = useServerFn(getMyPassport);
  const passportQ = useQuery({
    queryKey: ["passport", "mine"],
    queryFn: () => fetchPassport(),
    staleTime: 60_000,
    // A Passport backend that is briefly unavailable degrades one card, never
    // the whole career dashboard.
    retry: false,
  });

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

  const latestRun = runsQ.data?.[0];
  // A newer v3 completion must never be overwritten by legacy state: a
  // candidate whose only assessment is v3 has no legacy run and no legacy
  // profile, and must still count as having completed an assessment.
  const noAssessment =
    !activeIsDiscovery &&
    activeQ.status !== "pending" &&
    runsQ.status === "success" &&
    (runsQ.data.length === 0 || profileState.status === "no_profile");

  const greeting = L(c("Välkommen tillbaka", "Welcome back"), lang);
  const topAreaLabel = topFamilyId ? getCareerAreaLabel(topFamilyId)?.name[lang] : undefined;
  const topProfTitle = topProfession
    ? lang === "sv"
      ? topProfession.prof!.titleSv
      : topProfession.prof!.titleEn
    : undefined;

  // The approved dashboard greets by first name. `displayName` may be a full
  // name or an email local-part; either way the first token is the right
  // greeting and never renders an empty ", ".
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";

  // "Active" is the set an applicant is still waiting on. rejected / hired /
  // withdrawn are concluded, and counting them as active would tell somebody
  // they have five live applications when every one of them is closed.
  const activeApplications = (myApplicationsQ.data ?? []).filter(
    (a) => a.status === "submitted" || a.status === "reviewing" || a.status === "interview",
  ).length;

  // Employer-assigned work, and the ONLY thing that makes the tasks area
  // exist. Same filter MyAcademyWorkCard applies internally, computed here
  // because the layout has to know whether the row has one card or two before
  // that card decides to render nothing.
  const assessmentTasks = (academyWorkQ.data ?? []).filter((r) => r.mode === "assessment");
  const linkableTasks = linkableQ.data ?? [];
  const hasEmployerTask = assessmentTasks.length > 0 || linkableTasks.length > 0;

  return (
    <SiteLayout>
      {/* `Section` defaults to py-20/md:py-28 — the marketing pages' rhythm,
          where a section is a chapter and the air is the point. A dashboard is
          not read that way: 112px of empty space above the greeting pushed the
          first real card most of the way down the opening screen. Tightened
          here rather than in Section, which the public pages still want. */}
      <Section className="py-10 md:py-12">
        {/* ---------------- Who am I / what do I have ----------------

            This used to be a greeting and one line of copy, above seven
            equally weighted cards. Equal weight is a refusal to decide, and
            it left "where do I stand" below the fold behind six things that
            were not the answer. The summary states it in the first screen:
            professional identity, experience, country, and one row of
            product states each of which is a fact rather than a score.

            While the read is in flight the page shows the greeting it always
            showed rather than a spinner-shaped hole, and if it fails that is
            what stays. Nothing below depends on it. */}
        {identityQ.data ? (
          <ProfessionalIdentityHeader identity={identityQ.data} />
        ) : (
          <header className="max-w-3xl">
            <h1
              className="text-3xl font-semibold tracking-tight text-balance text-foreground md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {greeting}
              {firstName ? `, ${firstName}` : ""} <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              {L(
                c("Din säkerhetskarriär på ett ställe.", "Your security career in one place."),
                lang,
              )}
            </p>
          </header>
        )}

        {/* ---------------- What should I do next ----------------

            At most three, from the deterministic ladder in
            next-best-action.ts. An employer's invitation outranks everything
            this product might want for its own reasons; nothing here is a
            streak, a badge or a demand. */}
        {identityQ.data && (
          <div className="mt-8">
            <NextActions
              identity={identityQ.data}
              signals={{ savedCvCount: cvsQ.data?.length }}
            />
          </div>
        )}

        {/* ── Next step: an interview is waiting on this person ──

            Above the three cards because it is the one thing on this page with
            a deadline attached, and only rendered when it exists -- a permanent
            "no interviews" panel would make an ordinary state look like a
            shortfall.

            It links to interview INFORMATION, not to the interview: there is
            nothing for a candidate to do in the employer's workspace, and a
            link that leads to a permission error is worse than no link. */}
        {nextInterview && (
          <section
            aria-labelledby="next-interview"
            className="mt-7 rounded-xl border border-border bg-muted/40 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {L(c("Nästa steg", "Next step"), lang)}
            </p>
            <h2 id="next-interview" className="mt-1 text-lg font-semibold text-foreground">
              {L(c("Förbered din intervju", "Prepare for your interview"), lang)}
              {nextInterview.roleTitle ? ` — ${nextInterview.roleTitle}` : ""}
            </h2>
            {nextInterview.employerName && (
              <p className="mt-0.5 text-sm text-muted-foreground">{nextInterview.employerName}</p>
            )}
            <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
              {L(CANDIDATE_INTERVIEW_STATUS[nextInterview.status], lang)}
            </p>
            <Link
              to="/my-career/interviews/$caseId"
              params={{ caseId: nextInterview.caseId }}
              className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {L(c("Om intervjun", "About this interview"), lang)}
            </Link>
          </section>
        )}

        {/* ---------------- Row 1: Passport · Jobs · Profile ----------------

            Source of truth for order, on every viewport. The grid places them
            left to right on desktop; with no explicit ordering the same DOM
            sequence stacks Passport → Jobs → Profile on mobile, which is the
            approved mobile order, so no `order-*` classes are needed. */}
        {/* `items-start` is the whole fix for the dashboard's large empty
            panels. Grid items stretch to the tallest sibling by default, so
            while the Career Profile card rendered its full editor inline it
            dragged the Passport and Jobs cards down to match — roughly 900px
            of card for ~300px of content. The editor now lives in a dialog
            AND the row no longer stretches, so each card is as tall as what
            it actually contains.

            Widths are deliberately unequal: the Passport is the candidate's
            primary professional asset and gets the most room, then Jobs, then
            the self-reported profile summary. Source of truth for order on
            every viewport — the same DOM sequence stacks Passport → Jobs →
            Profile on mobile, which is the approved mobile order, so no
            `order-*` classes are needed. */}
        <div className="mt-7 grid items-start gap-6 lg:grid-cols-12">
          <PassportSummaryCard
            className="lg:col-span-5"
            snapshot={passportQ.data}
            isLoading={passportQ.isLoading}
            isError={passportQ.isError}
          />

          {/* ── Jobs and applications ── */}
          <DashboardCard
            className="lg:col-span-4"
            icon={<Briefcase className="h-5 w-5" />}
            title={L(c("Jobb & ansökningar", "Jobs & applications"), lang)}
          >
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  {L(c("Aktiva ansökningar", "Active applications"), lang)}
                </dt>
                {/* Deliberately blank rather than 0 while the query is in
                    flight or has failed: "0 active applications" is a claim
                    about this person's job search, and it must not be made on
                    the strength of a request that has not answered. */}
                <dd className="font-semibold tabular-nums text-foreground">
                  {myApplicationsQ.isSuccess ? activeApplications : "—"}
                </dd>
              </div>
            </dl>

            {jobsQ.data && jobsQ.data.length > 0 && (
              <ul className="mt-4 divide-y divide-border border-t border-border pt-1">
                {jobsQ.data.map((j) => {
                  const title =
                    (lang === "sv" ? j.title_sv : j.title_en) || j.title_en || j.title_sv || "";
                  const location =
                    [j.location_text, j.city, j.country].filter(Boolean).join(", ") || "";
                  return (
                    <li key={j.id}>
                      {/* min-h-11 (44px) rather than text-height. These rows
                          are a primary destination on a phone and were 20px
                          of tappable text. */}
                      <Link
                        to="/jobs/$slug"
                        params={{ slug: j.slug }}
                        className="group flex min-h-11 flex-col justify-center py-2"
                      >
                        <p className="text-sm font-medium text-balance text-foreground group-hover:underline">
                          {title}
                        </p>
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
            )}

            {jobsQ.isSuccess && jobsQ.data.length === 0 && (
              <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                {L(
                  c(
                    "Just nu finns inga öppna roller som matchar din profil.",
                    "There are no open roles matching your profile right now.",
                  ),
                  lang,
                )}
              </p>
            )}

            {/* Interview status, on the card the candidate already reads for
                "where are my applications up to". Not a new card: an interview
                IS an application's progress, and giving it its own tile would
                imply the platform runs a second, parallel process. */}
            {interviews.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-border pt-4">
                {interviews.map((iv) => (
                  <li key={iv.caseId} className="text-sm">
                    <p className="font-medium text-foreground">
                      {iv.roleTitle ?? L(c("Intervju", "Interview"), lang)}
                      {iv.employerName ? ` · ${iv.employerName}` : ""}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {L(CANDIDATE_INTERVIEW_STATUS[iv.status], lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/jobs"
                className="inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {L(c("Hitta jobb", "Find jobs"), lang)}
              </Link>
              <Link
                to="/my-career/applications"
                className="inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                {L(c("Mina ansökningar", "My applications"), lang)}
              </Link>
            </div>
          </DashboardCard>

          {/* ── Career profile ──

              Self-reported, and the card says so in as many words. The
              boundary is not decoration: this data is typed in by the holder
              and nothing here is checked by anyone, so presenting it beside a
              Passport full of verified credentials without naming the
              difference would let the Passport's credibility rub off on it. */}
          <DashboardCard
            id="career-profile"
            className="lg:col-span-3"
            icon={<UserIcon className="h-5 w-5" />}
            title={L(c("Din karriärprofil", "Your career profile"), lang)}
          >
            {/* The boundary is stated ONCE, by the card itself. It used to be
                stated here as well, in slightly different words, so the
                narrowest column on the dashboard opened with two paragraphs
                saying the same thing before any of the candidate's own
                information appeared. The sentence that survives is the one
                pinned by passport-separation-check. */}
            <SecurityCareerProfileCard />
          </DashboardCard>
        </div>

        {/* ---------------- Row 2: Career Discovery · Employer tasks ----------

            Career Discovery keeps its full read path — every report contract,
            the unreadable state and the history list. What changed is where it
            sits: it is a supporting product on this page now, not the spine of
            it. `lg:grid-cols-2` collapses to one column when there is no task,
            so Career Discovery is never left beside a hole. */}
        <div
          className={cn(
            "mt-6 grid items-start gap-6",
            hasEmployerTask ? "lg:grid-cols-2" : "lg:grid-cols-1",
          )}
        >
          <DashboardCard
            icon={<Compass className="h-5 w-5" />}
            title={L(c("Career Discovery", "Career Discovery"), lang)}
          >
            {activeQ.isLoading && (
              <div className="space-y-3" role="status" aria-live="polite">
                <p className="text-sm text-muted-foreground">
                  {t("careerDiscovery.dashboard.loading")}
                </p>
                <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
              </div>
            )}

            {activeQ.isError && (
              <>
                {/* Sanitised, and deliberately NOT a silent fall back to an
                    older legacy report presented as current. */}
                <p role="alert" className="text-sm text-destructive">
                  {t("careerDiscovery.dashboard.error")}
                </p>
                <button
                  type="button"
                  onClick={() => activeQ.refetch()}
                  className="mt-3 inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {t("careerDiscovery.dashboard.retry")}
                </button>
              </>
            )}

            {/* Each report contract reaches its own renderer, unchanged. */}
            {activeQ.data?.kind === "discovery_v3_0" && (
              <DiscoveryCareerSummary active={activeQ.data} />
            )}
            {activeQ.data?.kind === "discovery_v3_1" && (
              <DiscoveryV31Pending active={activeQ.data} />
            )}
            {activeIsUnreadable && activeQ.data?.kind === "discovery_unreadable" && (
              <DiscoveryReportUnreadable active={activeQ.data} />
            )}

            {activeIsLegacy && latestRun && (
              <AssessmentSummary
                lang={lang}
                completedAt={latestRun.completed_at ?? latestRun.started_at}
                profile={profile}
                topProfession={topProfTitle}
                topArea={topAreaLabel}
                runId={latestRun.id}
              />
            )}

            {/* No report yet — the introduction and the start CTA, which is
                the ONLY state where starting the test is the headline action. */}
            {noAssessment && (
              <div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {assessmentClosed
                    ? L(
                        c(
                          "Career Discovery visar dina styrkor, ditt arbetssätt och de säkerhetsroller som passar dig bäst. Den uppdaterade versionen granskas innan den öppnas för alla.",
                          "Career Discovery shows your strengths, how you work and the security roles that suit you best. The updated version is under review before it opens to everyone.",
                        ),
                        lang,
                      )
                    : L(
                        c(
                          "Career Discovery visar dina styrkor, ditt arbetssätt och de säkerhetsroller som passar dig bäst. Testet tar cirka fem minuter.",
                          "Career Discovery shows your strengths, how you work and the security roles that suit you best. It takes about five minutes.",
                        ),
                        lang,
                      )}
                </p>
                {/* The start CTA exists only when the gate would actually let
                    this candidate in. When it would not, the card offers the
                    thing they CAN do instead — a refusal with nowhere to go is
                    the dead end this gate was built to remove, and dropping
                    the CTA without replacing it would reintroduce it quietly. */}
                {assessmentClosed ? (
                  <Link
                    to="/career-center"
                    className="mt-4 inline-flex h-10 items-center rounded-md border border-input px-3.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {L(c("Utforska yrken", "Explore professions"), lang)}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link
                    to="/security-career-assessment"
                    className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {L(c("Starta testet", "Start the assessment"), lang)}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}

            {/* Previous reports stay reachable. Unchanged component, unchanged
                destinations — this is the read path the brief forbids
                regressing, and it is rendered from the SAME runsQ data as
                before, not a new query. */}
            {runsQ.data && runsQ.data.length > 1 && (
              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {L(c("Alla mina rapporter", "All my reports"), lang)}
                </summary>
                <div className="mt-3">
                  <ReportHistoryList legacyRuns={runsQ.data.slice(1) as never} />
                </div>
              </details>
            )}

            {/* Retake — small, secondary, and only for somebody who already
                has a report. It used to be a top-level Quick Action, which
                offered "redo the test" to people whose test was the thing they
                had just finished. */}
            {!noAssessment && !assessmentClosed && assessmentOpen && (
              <p className="mt-3 text-xs">
                {/* Deliberately quiet — a retake is not the headline action for
                    somebody who has just finished. Quiet is a matter of weight
                    and colour, though, not of hit area, so it still gets a
                    44px target. */}
                <Link
                  to="/security-career-assessment"
                  className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline"
                >
                  {L(c("Gör om testet (valfritt)", "Retake the assessment (optional)"), lang)}
                </Link>
              </p>
            )}
          </DashboardCard>

          {/* ── Employer tasks — rendered ONLY when one exists ──

              MyAcademyWorkCard returns null on an empty queue, and the
              linkable list is only non-empty when there is genuinely
              something to link, so this whole area disappears for the
              overwhelming majority of candidates rather than standing
              permanently empty. */}
          {hasEmployerTask && (
            <div className="space-y-6">
              <MyAcademyWorkCard />

              {/* Employer-assigned assessments completed before sign-in,
                  matched by verified email, offered for explicit linking.

                  This used to render only inside the legacy-report branch, so
                  a candidate on a v3 report was never offered the link at all
                  and their completed assessment stayed invisible. It is an
                  employer task and belongs with the employer tasks. */}
              {/* Demoted from a full dashboard card to a quiet strip inside
                  the tasks column. It is a one-off housekeeping action for a
                  small minority of accounts — an assessment taken before
                  signing in, matched by verified email — and it was carrying
                  the same visual weight as the Passport. The action itself is
                  unchanged, and it still only appears when there is genuinely
                  something to link. */}
              {linkableTasks.length > 0 && (
                <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {L(c("Koppla ett tidigare resultat", "Link an earlier result"), lang)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {L(
                      c(
                        "Du har genomfört en arbetsgivartilldelad bedömning med den här e-postadressen. Koppla resultatet till din profil för att se det under Mina rapporter.",
                        "You've completed an employer-assigned assessment with this email address. Link the result to your profile to see it under My Reports.",
                      ),
                      lang,
                    )}
                  </p>
                  <ul className="mt-2 divide-y divide-border">
                    {linkableTasks.map((a) => (
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
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Reviewer queue — self-hiding, and only for an account an employer
            has authorised to review responses (#51). */}
        <MyReviewQueueCard />

        {/* The account row that used to sit here — name, email,
            "Arbetsgivaryta", "Logga ut" — has moved to the header's account
            menu (src/components/site/AccountMenu.tsx).

            It was here because until that menu existed there was nowhere else
            to sign out, so this page carried the whole product's account
            chrome as a strip below its last card. That is what made a finished
            dashboard end on something that read as an unfinished footer.
            Nothing was dropped: identity, the membership-gated workspace
            switch and sign-out are all in the menu, on every page instead of
            this one. */}
      </Section>
    </SiteLayout>
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
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent"
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
// Small components
// -----------------------------------------------------------------

function DashboardCard({
  id,
  className,
  icon,
  title,
  action,
  children,
}: {
  /** Anchor target for in-page navigation. `scroll-mt` clears the sticky
   *  header, which a bare anchor would otherwise scroll the heading behind. */
  id?: string;
  /** Grid placement only. The card owns its own surface; callers position it. */
  className?: string;
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-xl border border-border bg-background p-5 md:p-6",
        className,
      )}
    >
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
