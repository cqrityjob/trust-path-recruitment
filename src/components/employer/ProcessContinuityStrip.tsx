// The process spine, as four lines and one next step.
//
// ── WHAT IT IS FOR ──────────────────────────────────────────────────────
//
// A recruiter opening an application has one question before any other: where
// is this, and what do I do about it? Before this block the answer was spread
// across four sections further down the page and two other areas of the
// product, and the recruiter assembled it themselves.
//
// So this is a READ of `projectProcess`, drawn compactly. It adds no data, no
// query and no state: everything it shows was already fetched by the page for
// the sections below, and every value comes from the pure projection.
//
// ── WHY IT IS DELIBERATELY SMALL ────────────────────────────────────────
//
// It is not a dashboard. There is no timeline, no stepper, no activity feed,
// no analytics and no second copy of the assessment or interview content --
// those are all a click away in their own governed surfaces, and duplicating
// them here would create a second version of a report that can drift from the
// first. Four rows and one action is the whole design.
//
// ── THE FOUR ROWS NEVER MERGE ───────────────────────────────────────────
//
// Application, assessment, interview and report each render their own state
// from their own source, in their own row, with their own words. There is no
// combined chip anywhere in this file and no expression that reads one track
// to describe another. The lede says so to the reader as well, because a
// four-row block is exactly the shape a person expects to be a funnel.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Clock, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  APPLICATION_STATUS_LABEL_KEY,
  asApplicationStatus,
} from "@/lib/job-intelligence/application-status";
import { CASE_STATUS_LABEL } from "@/components/employer/interview/InterviewUi";
import type {
  ActionDestination,
  AssessmentState,
  InterviewState,
  NextActionKind,
  ProcessProjection,
  ReportAvailability,
} from "@/lib/employer-continuity/process-projection";

/* ------------------------------------------------------------------ */
/* State -> word                                                       */
/* ------------------------------------------------------------------ */
//
// Three total maps, one per track, each keyed by the projection's own union.
// Total rather than defaulted: adding a state to the projection without giving
// it a word is a type error here, not a blank chip in production.

// The five REAL states borrow the words the assessment panel's own badge uses,
// a few inches below this block, so one attempt is never described twice in
// two vocabularies. Only the four answers about the READ are this module's own,
// because the panel has no word for them -- it is what this work added.
const ASSESSMENT_LABEL: Record<AssessmentState, TranslationKey> = {
  loading: "continuity.assessment.loading",
  unavailable: "continuity.assessment.unavailable",
  refused: "continuity.assessment.refused",
  none: "continuity.assessment.none",
  invited: "journey.stage.invited",
  in_progress: "journey.stage.started",
  under_review: "journey.stage.under_review",
  brief_ready: "journey.stage.ready_to_release",
  brief_released: "journey.stage.report_available",
};

const INTERVIEW_LABEL: Record<InterviewState, TranslationKey> = {
  loading: "continuity.interview.loading",
  unavailable: "continuity.interview.unavailable",
  refused: "continuity.interview.refused",
  none: "continuity.interview.none",
  preparing: "continuity.interview.preparing",
  readyToInterview: "continuity.interview.readyToInterview",
  interviewing: "continuity.interview.interviewing",
  evidenceReview: "continuity.interview.evidenceReview",
  reportMaterialReady: "continuity.interview.reportMaterialReady",
  reportFinalised: "continuity.interview.reportFinalised",
  cancelled: "continuity.interview.cancelled",
  unknown: "continuity.interview.unknown",
};

const REPORT_LABEL: Record<ReportAvailability, TranslationKey> = {
  loading: "continuity.report.loading",
  unavailable: "continuity.report.unavailable",
  refused: "continuity.report.refused",
  none: "continuity.report.none",
  materialReady: "continuity.report.materialReady",
  finalised: "continuity.report.finalised",
};

/** The sentence under "Nästa steg", per action. Total for the same reason. */
const NEXT_BODY: Record<NextActionKind, TranslationKey> = {
  loading: "continuity.next.loading",
  unavailable: "continuity.next.unavailable.both",
  reviewInterviewEvidence: "continuity.next.reviewInterviewEvidence",
  reviewAssessmentResponses: "continuity.next.reviewAssessmentResponses",
  reviewReportMaterial: "continuity.next.reviewReportMaterial",
  startInterview: "continuity.next.startInterview",
  continueInterview: "continuity.next.continueInterview",
  assessInterviewEvidence: "continuity.next.assessInterviewEvidence",
  prepareInterview: "continuity.next.prepareInterview",
  shareAssessmentBrief: "continuity.next.shareAssessmentBrief",
  awaitCandidateAssessment: "continuity.next.awaitCandidateAssessment",
  awaitColleague: "continuity.next.awaitColleague",
  openFinalisedReport: "continuity.next.openFinalisedReport",
  nothingStarted: "continuity.next.nothingStarted",
  nothingOutstanding: "continuity.next.nothingOutstanding",
};

/** The call to action, where there is one. Absent for every state whose honest
 *  answer is a sentence: waiting on the candidate, waiting on a colleague, a
 *  failed read, or nothing outstanding. A button there would be an invitation
 *  to do something that does not exist. */
const NEXT_CTA: Partial<Record<NextActionKind, TranslationKey>> = {
  reviewInterviewEvidence: "continuity.next.reviewInterviewEvidence.cta",
  reviewAssessmentResponses: "continuity.next.reviewAssessmentResponses.cta",
  reviewReportMaterial: "continuity.next.reviewReportMaterial.cta",
  startInterview: "continuity.next.startInterview.cta",
  continueInterview: "continuity.next.continueInterview.cta",
  assessInterviewEvidence: "continuity.next.assessInterviewEvidence.cta",
  prepareInterview: "continuity.next.prepareInterview.cta",
  shareAssessmentBrief: "continuity.next.shareAssessmentBrief.cta",
  openFinalisedReport: "continuity.next.openFinalisedReport.cta",
};

/* ------------------------------------------------------------------ */
/* Destination -> typed link                                           */
/* ------------------------------------------------------------------ */

/** Every destination resolved through the generated route tree.
 *
 *  A discriminated union in, a typed `<Link>` out, and no template string
 *  anywhere: a route that is renamed or removed breaks the build here rather
 *  than producing a link that 404s in a recruiter's hands.
 *
 *  ── WHERE THE APPLICATION ID TRAVELS, AND WHAT IT MEANS ────────────────
 *
 *  It travels as a SEARCH PARAMETER on the review destination
 *  (`?application=<uuid>`), because the review route has no application in its
 *  path and would otherwise have no way to return to the candidate it was
 *  opened from. An earlier version of this comment claimed the id was never a
 *  search parameter, which was simply untrue of the code beneath it.
 *
 *  What that parameter is:
 *
 *    * NAVIGATION CONTEXT. It answers "where do I go back to", and nothing
 *      else on the destination is fetched with it.
 *    * NOT AUTHORITY. It grants no access and widens nothing. The review route
 *      validates it as a uuid and uses it for one link; the queue below it is
 *      scoped entirely by the database, and scp_complete_human_review
 *      re-decides on write. A hand-edited value costs a wrong "back" link and
 *      reveals not one word of anybody's answers.
 *    * RE-VERIFIED AT THE FAR END. Every destination re-establishes its own
 *      authorisation on arrival from the caller's own membership, exactly as
 *      it does for somebody who navigated there directly.
 *
 *  What never travels: a candidate's name, an email address, an internal title
 *  or any other human-readable label. Only opaque server-issued identifiers
 *  reach a URL, which the E1 guard asserts by rendering every reachable state
 *  and inspecting every href it draws. */
function DestinationLink({
  destination,
  employerSlug,
  applicationId,
  label,
}: {
  destination: ActionDestination;
  employerSlug: string;
  applicationId: string;
  label: string;
}) {
  const cls =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const icon = <ArrowRight className="h-4 w-4" aria-hidden="true" />;

  switch (destination.kind) {
    case "none":
      return null;
    case "assessmentReview":
      return (
        <Link
          to="/employer/$employerSlug/assessments/reviews/$attemptId"
          params={{ employerSlug, attemptId: destination.attemptId }}
          // Carried so the review can return to the candidate it belongs to
          // rather than ending on the queue. Navigation context only: the
          // review workspace re-derives every authority it uses from the
          // attempt, and an application id here grants nothing.
          search={{ application: applicationId }}
          className={cls}
        >
          {label}
          {icon}
        </Link>
      );
    case "assessmentParticipants":
      return (
        <Link
          to="/employer/$employerSlug/assessments/participants"
          params={{ employerSlug }}
          search={{ state: "ready_to_release" as const }}
          className={cls}
        >
          {label}
          {icon}
        </Link>
      );
    case "interviewCase":
      return (
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId: destination.caseId }}
          className={cls}
        >
          {label}
          {icon}
        </Link>
      );
    case "interviewReport":
      return (
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/report"
          params={{ employerSlug, caseId: destination.caseId }}
          className={cls}
        >
          {label}
          {icon}
        </Link>
      );
  }
}

/* ------------------------------------------------------------------ */
/* The strip                                                           */
/* ------------------------------------------------------------------ */

export function ProcessContinuityStrip({
  projection,
  employerSlug,
  applicationId,
  onRetry,
}: {
  projection: ProcessProjection;
  employerSlug: string;
  applicationId: string;
  /** Re-runs the reads that failed, without leaving the route. */
  onRetry: () => void;
}) {
  const { t } = useT();
  const { application, assessment, interview, report, nextAction } = projection;

  const appStatus = asApplicationStatus(application.status ?? "");
  const applicationWord =
    application.read === "loading"
      ? t("continuity.assessment.loading")
      : appStatus
        ? t(APPLICATION_STATUS_LABEL_KEY[appStatus])
        : (application.status ?? "—");

  // The unavailable sentence names WHICH track failed. "Something went wrong"
  // leaves a recruiter unable to tell whether the missing thing matters.
  const nextBody: TranslationKey =
    nextAction.kind === "unavailable"
      ? nextAction.unavailableTrack === "assessment"
        ? "continuity.next.unavailable.assessment"
        : nextAction.unavailableTrack === "interview"
          ? "continuity.next.unavailable.interview"
          : "continuity.next.unavailable.both"
      : NEXT_BODY[nextAction.kind];

  const ctaKey = NEXT_CTA[nextAction.kind];

  // ONE WORD PER STATE, ACROSS THE PAGE.
  //
  // Where a case actually exists, its state is named with the runtime's own
  // label -- the same one the chip further down this page and the interview
  // list both draw. The continuity vocabulary is used only where there is no
  // case to name: nothing planned, still loading, or a read that failed. The
  // strip said "Klar att genomföras" six inches above a chip reading "Redo för
  // intervju", for one status, and a reader has no way to know those are the
  // same fact.
  const interviewWord =
    interview.read === "ready" && interview.leadStatus
      ? t(CASE_STATUS_LABEL[interview.leadStatus] ?? INTERVIEW_LABEL[interview.state])
      : t(INTERVIEW_LABEL[interview.state]);

  return (
    <section
      className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4"
      aria-labelledby="continuity-heading"
    >
      <h2 id="continuity-heading" className="text-sm font-semibold text-foreground">
        {t("continuity.heading")}
      </h2>
      {/* The funnel disclaimer, in the product rather than only in the code.
          Four rows in a column is the shape of a sequence, and it is not one. */}
      <p className="mt-1 max-w-[74ch] text-[12px] leading-relaxed text-muted-foreground">
        {t("continuity.lede")}
      </p>

      {/* Four tracks, four rows, four sources. A definition list because that
          is what this is: a term and the state of it. */}
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <TrackRow term={t("continuity.track.application")} value={applicationWord} />
        <TrackRow
          term={t("continuity.track.assessment")}
          value={t(ASSESSMENT_LABEL[assessment.state])}
          degraded={assessment.read === "failed" || assessment.read === "refused"}
        />
        <TrackRow
          term={t("continuity.track.interview")}
          value={interviewWord}
          degraded={interview.read === "failed" || interview.read === "refused"}
        />
        <TrackRow
          term={t("continuity.track.report")}
          value={t(REPORT_LABEL[report.availability])}
          degraded={report.read === "failed" || report.read === "refused"}
        />
      </dl>

      {/* ── The one next step ──────────────────────────────────────────
          One primary action per state, and never more than one. Where the
          honest answer is a sentence, it is a sentence: the icon distinguishes
          "you have work", "we are waiting" and "we could not read this"
          without relying on colour, which is the accessibility rule and also
          just clearer. */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {t("continuity.next.heading")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p
            className="flex max-w-[68ch] items-start gap-2 text-[13px] leading-relaxed text-foreground"
            // Announced when the process state resolves or changes underneath
            // the recruiter, which is the moment they need to hear it.
            role="status"
          >
            <NextIcon kind={nextAction.kind} waitingOn={nextAction.waitingOn} />
            <span>{t(nextBody)}</span>
          </p>

          {ctaKey && (
            <DestinationLink
              destination={nextAction.destination}
              employerSlug={employerSlug}
              applicationId={applicationId}
              label={t(ctaKey)}
            />
          )}

          {/* A failed read gets a retry rather than a dead end, and the retry
              stays on this route so nothing about where the recruiter is
              changes. */}
          {nextAction.kind === "unavailable" && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("continuity.next.retry")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** One track. `degraded` marks a row whose value is a report about the READ
 *  rather than about the process — never styled as though it were a state the
 *  candidate is in. */
function TrackRow({
  term,
  value,
  degraded = false,
}: {
  term: string;
  value: string;
  degraded?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <dt className="font-medium text-muted-foreground">{term}</dt>
      <dd
        className={degraded ? "font-medium text-amber-700 dark:text-amber-300" : "text-foreground"}
      >
        {degraded && (
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
        )}
        {value}
      </dd>
    </div>
  );
}

/** Status by shape as well as by colour. */
function NextIcon({ kind, waitingOn }: { kind: NextActionKind; waitingOn: string }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground";
  if (kind === "unavailable")
    return (
      <AlertTriangle className={`${cls} text-amber-700 dark:text-amber-300`} aria-hidden="true" />
    );
  if (waitingOn === "candidate" || waitingOn === "colleague")
    return <Clock className={cls} aria-hidden="true" />;
  return <UserRound className={cls} aria-hidden="true" />;
}
