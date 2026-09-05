// Applications, tests and results — an ordinary operational section.
//
// ── WHY THE REPORT HERO IS GONE ────────────────────────────────────────
//
// An employer's assessment report used to own the largest, darkest surface
// on this page — larger than the Passport, larger than the recommended next
// step. That is the wrong hierarchy for a candidate's own career home: a
// report is a temporary artefact of one employer's process, and the
// Passport is the person's long-term evidence. A released result is
// announced once, at the top, only when it is genuinely the most important
// thing today; otherwise it is a row here.
//
// ── ORDER IS THE PRODUCT DECISION ──────────────────────────────────────
//
//   1  what needs the candidate      an open test, with its deadline
//   2  what was released to them     a result they can read
//   3  what is waiting on somebody else, said in words
//
// The third is a STATUS, never a task, and the sentence says so outright:
// "you do not need to do anything right now". A passive state rendered as
// a task is the specific failure this ordering exists to prevent.

import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, FileText } from "lucide-react";
import { useT } from "@/i18n/context";
import type { AssessmentsModel, JobsModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, Lp, type Lang } from "./copy";
import { APPLICATION_STATUS, CLASSIFICATION, WORK } from "./home-copy";

function formatDate(iso: string | null, l: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

/** A word for the state, so nothing depends on seeing a colour. */
function Chip({ label }: { label: string }) {
  return (
    <p className="inline-flex items-center self-start rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
      {label}
    </p>
  );
}

export function ApplicationsAndResults({
  assessments,
  jobs,
  children,
  className,
}: {
  assessments: AssessmentsModel;
  jobs: JobsModel;
  /** Housekeeping that belongs beside the tests — currently the offer to
   *  link an assessment completed before this account existed. */
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const activeApplications = jobs.state === "ready" ? jobs.activeApplicationCount : null;
  const latestStatus = jobs.state === "ready" ? jobs.latestStatus : null;

  return (
    <section aria-labelledby="work-heading" data-applications-and-results className={className}>
      <h2
        id="work-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(WORK.heading, l)}
      </h2>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {/* ---- Applications ------------------------------------------- */}
        <article
          className="flex flex-col rounded-xl border border-border bg-card p-5"
          data-applications
        >
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="text-accent" aria-hidden="true">
              <FileText className="h-4 w-4" />
            </span>
            {L(WORK.applicationsTitle, l)}
          </h3>
          {jobs.state !== "ready" || activeApplications === null ? (
            <p role="status" className="mt-2 text-sm italic text-muted-foreground">
              {L(WORK.applicationsUnavailable, l)}
            </p>
          ) : activeApplications === 0 && !latestStatus ? (
            <p className="mt-2 text-sm text-muted-foreground">{L(WORK.applicationsNone, l)}</p>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-foreground">
                {Lp(WORK.applicationsActive, l, activeApplications)}
              </p>
              {latestStatus && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {Lf(WORK.applicationsLatest, l, L(APPLICATION_STATUS[latestStatus], l))}
                </p>
              )}
              {jobs.interviewCount > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {Lp(WORK.interviews, l, jobs.interviewCount)}
                </p>
              )}
            </>
          )}
          <Link
            to="/my-career/applications"
            className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-3 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {L(WORK.applicationsCta, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </article>

        {/* ---- Tests and results -------------------------------------- */}
        <article
          className="flex flex-col rounded-xl border border-border bg-card p-5"
          data-tests-and-results
        >
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="text-accent" aria-hidden="true">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            {L(WORK.testsTitle, l)}
          </h3>

          {assessments.state !== "ready" ? (
            <p role="status" className="mt-2 text-sm italic text-muted-foreground">
              {L(WORK.testsUnavailable, l)}
            </p>
          ) : assessments.actionRequired.length === 0 &&
            assessments.released.length === 0 &&
            assessments.waitingCount === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{L(WORK.testsNone, l)}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {/* 1 · needs the candidate */}
              {assessments.actionRequired.map((a) => {
                const deadline = formatDate(a.deadline, l);
                return (
                  <li key={a.id} className="py-2.5" data-test-row="action-required">
                    <Chip label={L(CLASSIFICATION.action_required, l)} />
                    <p className="mt-1 text-sm font-medium text-balance text-foreground">
                      {[
                        a.employerName,
                        l === "sv" ? (a.purposeSv ?? a.titleSv) : (a.purposeEn ?? a.titleEn),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        Lf(WORK.testProgress, l, `${a.answered}/${a.totalItems}`),
                        deadline ? Lf(WORK.testDeadline, l, deadline) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <Link
                      to={a.href}
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {L(WORK.testOpen, l)}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}

              {/* 2 · released to them */}
              {assessments.released.map((r) => {
                const released = formatDate(r.releasedAt, l);
                return (
                  <li key={r.id} className="py-2.5" data-test-row="released">
                    <Chip label={L(CLASSIFICATION.new_for_you, l)} />
                    <p className="mt-1 text-sm font-medium text-balance text-foreground">
                      {[r.employerName, l === "sv" ? r.titleSv : r.titleEn]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {released && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <time dateTime={r.releasedAt}>{Lf(WORK.resultReleased, l, released)}</time>
                      </p>
                    )}
                    <Link
                      to={r.href}
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {L(WORK.resultOpen, l)}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}

              {/* 3 · waiting on somebody else. Last, and it says outright
                     that nothing is required. */}
              {assessments.waitingCount > 0 && (
                <li className="py-2.5" data-test-row="waiting">
                  <Chip label={L(CLASSIFICATION.in_progress_no_action, l)} />
                  <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
                    {Lp(WORK.waiting, l, assessments.waitingCount)}
                  </p>
                </li>
              )}
            </ul>
          )}

          {children}
        </article>
      </div>
    </section>
  );
}
