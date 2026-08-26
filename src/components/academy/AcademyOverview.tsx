// Tester & bedömningar — the recruitment assessment overview.
//
// ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────
//
// One question: what needs me, and where do I click. The page before it
// opened with a section heading, a paragraph of methodology and a card
// explaining that recruitment assessment was unavailable — on the surface
// that IS the recruitment assessment product. A recruiter read three
// explanations before reaching a number, and the numbers themselves were the
// only part of it that led anywhere.
//
// So the order is inverted. Four counts, then the work, then — behind a
// disclosure, for the reader who wants it — how the assessments work.
//
// ── EVERY NUMBER IS A DOOR ────────────────────────────────────────────
//
// Each tile counts something an employer has to DO something about, and each
// one opens the list filtered to exactly that state, so the destination
// visibly matches the card that was clicked. A zero is still a link: an empty
// filtered list is a perfectly good answer, and a tile that is clickable on
// Monday and dead on Tuesday teaches people not to try.
//
// ── ONE SOURCE FOR EVERY COUNT ────────────────────────────────────────
//
// All five numbers come from the pipeline read model — the same rows
// Kandidater renders — so a tile cannot disagree with the list under it.
// scp_employer_review_pressure counts the same pending reviews organisation
// wide, which is the wrong scope for a surface that is recruitment only:
// deriving both review numbers from the recruitment rows is what keeps
// "8 kandidater väntar på granskning" and the list of eight in agreement.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, FileCheck2, Users, Hourglass } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { AcademyHeading } from "@/components/academy/AcademyWorkspace";
import { getEmployerAssessmentPipeline } from "@/lib/security-competency/assessment-lifecycle.functions";

export function AcademyOverview({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { t, tp } = useT();
  const pipelineFn = useServerFn(getEmployerAssessmentPipeline);

  const pipeline = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => pipelineFn({ data: { employerId } }),
  });

  // ── A NUMBER YOU DO NOT HAVE YET IS NOT ZERO ─────────────────────────
  //
  // These tiles rendered `data ?? []` straight into a count, so for the second
  // or so before the query resolved every card read 0 -- and then silently
  // changed. "Väntar på granskning: 0" is not a slow answer, it is a wrong
  // one, and it is the answer an employer glancing at the page actually took
  // away. While the query is in flight the tiles show a dash instead.
  const loading = pipeline.isPending;

  // Recruitment only. This area sits under Rekrytering; competence
  // development for existing staff is its own area, with its own people, and
  // mixing the two is what made "Kandidater" mean two different things.
  const rows = (pipeline.data ?? []).filter((r) => r.useCase === "recruitment");

  const ongoing = rows.filter(
    (r) => r.lifecycleState === "invited" || r.lifecycleState === "in_progress",
  ).length;
  const underReview = rows.filter((r) => r.lifecycleState === "under_review");
  const awaitingCandidates = underReview.length;
  const awaitingResponses = underReview.reduce((n, r) => n + r.reviewsOpen, 0);
  const ready = rows.filter((r) => r.lifecycleState === "ready_to_release").length;
  const completed = rows.filter((r) => r.lifecycleState === "result_available").length;

  const hasWork = !loading && (awaitingCandidates > 0 || ready > 0);

  return (
    <>
      <AcademyHeading title={t("academy.overview.title")} lede={t("academy.overview.lede")} />

      {/* Four tiles, in journey order, answering exactly the four questions the
          recruiter has: what is running, what needs a person, what is waiting
          on me, what is done. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatLink
          icon={Users}
          label="academy.overview.active"
          value={ongoing}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "active" as const }}
        />
        {/* The one tile where the work is a person's time. Its sub-line says
            how many responses that is, so the number is a workload rather
            than a mystery. */}
        <StatLink
          icon={Hourglass}
          label="academy.overview.awaitingReviewUnified"
          value={awaitingCandidates}
          loading={loading}
          detail={
            awaitingResponses > 0
              ? `${awaitingResponses} ${tp("academy.overview.todoResponses", awaitingResponses)}`
              : undefined
          }
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/reviews"
          search={{ scope: "all" as const }}
        />
        {/* The one state where the EMPLOYER is the party being waited on. */}
        <StatLink
          icon={FileCheck2}
          label="academy.overview.readyToRelease"
          value={ready}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "ready_to_release" as const }}
        />
        <StatLink
          icon={ClipboardCheck}
          label="academy.overview.released"
          value={completed}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "result_available" as const }}
        />
      </div>

      {/* ── ATT GÖRA NU ──────────────────────────────────────────────────
       *
       *  The tiles say what the numbers are; this says what to do about them,
       *  in one sentence each and with the button that does it. When there is
       *  nothing outstanding it says so plainly rather than showing an
       *  actionless heading -- an employer should be able to leave this page
       *  knowing they are done. */}
      <section
        aria-labelledby="academy-todo"
        className="mt-8 rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]"
      >
        <h2 id="academy-todo" className="text-sm font-semibold text-foreground">
          {t("academy.overview.todoTitle")}
        </h2>

        {loading ? (
          <p className="mt-2 text-[13px] text-muted-foreground">{t("employer.loading")}</p>
        ) : hasWork ? (
          <>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-foreground">
              {awaitingCandidates > 0 && (
                <li>
                  <span className="font-semibold tabular-nums">{awaitingCandidates}</span>{" "}
                  {tp("academy.overview.todoCandidates", awaitingCandidates)}
                </li>
              )}
              {awaitingResponses > 0 && (
                <li>
                  <span className="font-semibold tabular-nums">{awaitingResponses}</span>{" "}
                  {tp("academy.overview.todoResponses", awaitingResponses)}
                </li>
              )}
              {ready > 0 && (
                <li>
                  <span className="font-semibold tabular-nums">{ready}</span>{" "}
                  {tp("academy.overview.todoReady", ready)}
                </li>
              )}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {awaitingCandidates > 0 && (
                <Link
                  to="/employer/$employerSlug/assessments/reviews"
                  params={{ employerSlug }}
                  search={{ scope: "all" as const }}
                  className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("academy.overview.openReviewQueue")}
                </Link>
              )}
              <Link
                to="/employer/$employerSlug/assessments/participants"
                params={{ employerSlug }}
                search={ready > 0 ? { state: "ready_to_release" as const } : {}}
                className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("academy.overview.openParticipants")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
              {t("academy.overview.todoNothing")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/employer/$employerSlug/assessments/library"
                params={{ employerSlug }}
                className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("academy.overview.openLibrary")}
              </Link>
              <Link
                to="/employer/$employerSlug/assessments/participants"
                params={{ employerSlug }}
                className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("academy.overview.openParticipants")}
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Methodology, for the reader who wants it, out of the way of the reader
          who does not. It used to be the first thing on the page. */}
      <details className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] px-5 py-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {t("academy.overview.howItWorks")}
        </summary>
        <p className="mt-3 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.overview.howItWorksBody")}
        </p>
      </details>
    </>
  );
}

const STAT_SHELL = "rounded-[14px] border border-border bg-card p-5";

/** A metric that is also the way to the work it counts. */
function StatLink<S extends Record<string, string>>({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  employerSlug,
  to,
  search,
}: {
  icon: typeof Users;
  label: TranslationKey;
  value: number;
  loading?: boolean;
  /** Optional second line: the same work, measured the way the engine counts
   *  it. Supporting information, never a competing headline. */
  detail?: string;
  employerSlug: string;
  to: string;
  search: S;
}) {
  const { t } = useT();
  return (
    <Link
      to={to}
      params={{ employerSlug }}
      search={search}
      className={`${STAT_SHELL} block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none`}
    >
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {t(label)}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {loading ? <span className="text-muted-foreground/50">&mdash;</span> : value}
      </p>
      {!loading && detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </Link>
  );
}
