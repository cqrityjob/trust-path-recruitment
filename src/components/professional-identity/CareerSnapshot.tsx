// The career snapshot — four compact destinations, one status each.
//
// ── WHY FOUR CARDS OF THE SAME SIZE ────────────────────────────────────
//
// These are the product's four pillars, reachable in one click. They are
// deliberately NOT the products' own dashboards in miniature: no history,
// no explanation, no second call to action. Each says its name, one
// status, at most two counts, whether it needs the person, and where it
// goes. The equal size is the point — the priority workspace above has
// already decided what matters, so nothing here competes with it.
//
// ── UNKNOWN IS NOT ZERO ────────────────────────────────────────────────
//
// Every figure arrives from the presentation model already classified as
// counted, absent or unreadable, and "Kunde inte läsas" is rendered as a
// status in its own right. A card must never print 0 for a read that did
// not answer.
//
// ── THE CAREER ANALYSIS CARD KEEPS EVERY REPORT CONTRACT ───────────────
//
// Career Discovery stores two v3 payloads and a legacy one, and a build
// may meet a report it cannot read. Each state is named here explicitly
// and links to the place that can render it; the "unreadable" state stays
// a state rather than degrading into "no report", and the closed gate says
// why and offers something the person can actually do.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, ClipboardCheck, Compass, IdCard, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { SnapshotModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, Lp, type Lang } from "./copy";
import { SNAPSHOT } from "./home-copy";

/** The Career Analysis card's state, resolved by the route from the active
 *  report read. Every contract the store can hold is a branch here. */
export type CareerAnalysisState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string; readonly onRetry: () => void }
  | { readonly kind: "ready"; readonly href: string; readonly completedAt: string | null }
  | { readonly kind: "unreadable"; readonly title: string; readonly completedAt: string | null }
  /** No report. `closed` means the gate ANSWERED no. */
  | { readonly kind: "none"; readonly closed: boolean };

function formatDate(iso: string | null, l: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function Card({
  id,
  icon,
  title,
  status,
  statusState,
  actionRequired,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  status: string;
  /** counts | empty | unavailable | loading — carried in markup so a guard
   *  can tell a genuine zero from a read that failed. */
  statusState: "counts" | "empty" | "unavailable" | "loading";
  actionRequired: boolean;
  children: React.ReactNode;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <article
      data-snapshot={id}
      data-status-state={statusState}
      className="flex min-h-[9.5rem] flex-col rounded-xl border border-border bg-card p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-accent" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      <p
        className={cn(
          "mt-2 text-sm",
          statusState === "unavailable" ? "italic text-muted-foreground" : "text-muted-foreground",
        )}
      >
        {status}
      </p>
      {actionRequired && (
        <p className="mt-1.5 inline-flex self-start rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          {L(SNAPSHOT.actionRequired, l)}
        </p>
      )}
      <div className="mt-auto pt-3">{children}</div>
    </article>
  );
}

function CardLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      data-snapshot-cta
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

export function CareerSnapshot({
  snapshot,
  analysis,
}: {
  snapshot: SnapshotModel;
  analysis: CareerAnalysisState;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const { passport, assessments, jobs } = snapshot;

  /* ---- Passport ------------------------------------------------------ */
  const passportStatus =
    passport.state === "unavailable"
      ? L(SNAPSHOT.unreadable, l)
      : passport.state === "not_opened"
        ? L(SNAPSHOT.passportNotOpened, l)
        : [
            Lp(SNAPSHOT.passportVerified, l, passport.verified),
            passport.underReview === null
              ? L(SNAPSHOT.passportReviewUnknown, l)
              : passport.underReview > 0
                ? Lp(SNAPSHOT.passportUnderReview, l, passport.underReview)
                : null,
          ]
            .filter((s): s is string => s !== null)
            .join(" · ");

  /* ---- Assessments --------------------------------------------------- */
  const assessmentParts =
    assessments.state === "counts"
      ? [
          assessments.open > 0 ? Lp(SNAPSHOT.assessmentsOpen, l, assessments.open) : null,
          assessments.released > 0
            ? Lp(SNAPSHOT.assessmentsReleased, l, assessments.released)
            : null,
          assessments.awaitingRelease > 0
            ? Lp(SNAPSHOT.assessmentsAwaiting, l, assessments.awaitingRelease)
            : null,
        ].filter((s): s is string => s !== null)
      : [];
  const assessmentsStatus =
    assessments.state === "unavailable"
      ? L(SNAPSHOT.unreadable, l)
      : assessmentParts.length > 0
        ? assessmentParts.join(" · ")
        : L(SNAPSHOT.assessmentsNone, l);

  /* ---- Jobs ---------------------------------------------------------- */
  const jobsStatus =
    jobs.state === "unavailable"
      ? L(SNAPSHOT.unreadable, l)
      : [
          Lp(SNAPSHOT.jobsActive, l, jobs.activeApplications),
          jobs.interviews > 0 ? Lp(SNAPSHOT.jobsInterviews, l, jobs.interviews) : null,
        ]
          .filter((s): s is string => s !== null)
          .join(" · ");

  /* ---- Career analysis ----------------------------------------------- */
  const analysisDate =
    analysis.kind === "ready" || analysis.kind === "unreadable"
      ? formatDate(analysis.completedAt, l)
      : null;
  const analysisStatus =
    analysis.kind === "loading"
      ? L(SNAPSHOT.analysisLoading, l)
      : analysis.kind === "error"
        ? analysis.message
        : analysis.kind === "ready"
          ? analysisDate
            ? `${L(SNAPSHOT.analysisReady, l)} · ${Lf(SNAPSHOT.analysisCompleted, l, analysisDate)}`
            : L(SNAPSHOT.analysisReady, l)
          : analysis.kind === "unreadable"
            ? analysis.title
            : analysis.closed
              ? L(SNAPSHOT.analysisClosed, l)
              : L(SNAPSHOT.analysisNone, l);

  return (
    <section aria-labelledby="snapshot-heading">
      <h2
        id="snapshot-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(SNAPSHOT.heading, l)}
      </h2>
      <div className="mt-3 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          id="passport"
          icon={<IdCard className="h-4 w-4" />}
          title={L(SNAPSHOT.passportTitle, l)}
          status={passportStatus}
          statusState={
            passport.state === "unavailable"
              ? "unavailable"
              : passport.state === "not_opened"
                ? "empty"
                : "counts"
          }
          actionRequired={passport.state === "counts" && passport.actionRequired > 0}
        >
          <CardLink to="/passport" label={L(SNAPSHOT.passportOpen, l)} />
        </Card>

        <Card
          id="career-analysis"
          icon={<Compass className="h-4 w-4" />}
          title={L(SNAPSHOT.analysisTitle, l)}
          status={analysisStatus}
          statusState={
            analysis.kind === "loading"
              ? "loading"
              : analysis.kind === "error"
                ? "unavailable"
                : analysis.kind === "none"
                  ? "empty"
                  : "counts"
          }
          actionRequired={false}
        >
          {analysis.kind === "loading" ? (
            <div
              role="status"
              aria-live="polite"
              className="h-11 w-2/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
            />
          ) : analysis.kind === "error" ? (
            <button
              type="button"
              onClick={analysis.onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {L(SNAPSHOT.analysisRetry, l)}
            </button>
          ) : analysis.kind === "ready" ? (
            <CardLink to={analysis.href} label={L(SNAPSHOT.analysisView, l)} />
          ) : analysis.kind === "unreadable" ? (
            <CardLink
              to="/security-career-assessment/history"
              label={L(SNAPSHOT.analysisHistory, l)}
            />
          ) : analysis.closed ? (
            /* A refusal with nowhere to go is the dead end the gate was built
               to remove: the closed state offers the thing they CAN do. */
            <CardLink to="/career-center" label={L(SNAPSHOT.analysisExplore, l)} />
          ) : (
            <CardLink to="/security-career-assessment" label={L(SNAPSHOT.analysisStart, l)} />
          )}
        </Card>

        <Card
          id="assessments"
          icon={<ClipboardCheck className="h-4 w-4" />}
          title={L(SNAPSHOT.assessmentsTitle, l)}
          status={assessmentsStatus}
          statusState={
            assessments.state === "unavailable"
              ? "unavailable"
              : assessmentParts.length > 0
                ? "counts"
                : "empty"
          }
          actionRequired={assessments.state === "counts" && assessments.open > 0}
        >
          <CardLink to="/academy" label={L(SNAPSHOT.assessmentsView, l)} />
        </Card>

        <Card
          id="jobs"
          icon={<Briefcase className="h-4 w-4" />}
          title={L(SNAPSHOT.jobsTitle, l)}
          status={jobsStatus}
          statusState={jobs.state === "unavailable" ? "unavailable" : "counts"}
          actionRequired={false}
        >
          <CardLink to="/jobs" label={L(SNAPSHOT.jobsExplore, l)} />
        </Card>
      </div>
    </section>
  );
}
