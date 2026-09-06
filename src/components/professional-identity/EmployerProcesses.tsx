// Applications, tests and results — the employer's processes, in rows.
//
// ── ORDER IS THE PRODUCT DECISION ──────────────────────────────────────
//
//   1  what needs the candidate      an open test, with its deadline
//   2  what was released to them     a result they can read, dated
//   3  what is waiting on somebody else, said in words
//
// The third is a STATUS. Only the pipeline's explicit states are called
// waiting; anything else is shown with its raw status and a link to the
// canonical page, never dressed up as "awaiting the employer".
//
// ── A FEATURED ITEM IS NOT A MISSING ITEM ──────────────────────────────
//
// When the one open test is the recommended step above, this section says
// so. It never says "no employer has asked you to take a test" about a
// test it just removed from its own list.
//
// ── AN APPLICANT IS NOT AN EMPLOYEE ────────────────────────────────────
//
// A recruitment test says which organisation REQUESTED it and for which
// role. Training is ASSIGNED by an employer and lives in its own section.
// A released result is the employer's material in that process; it does
// not become a merit, and the section says so once.

import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, FileText } from "lucide-react";
import { useT } from "@/i18n/context";
import type {
  ApplicationsModel,
  EmployerWorkModel,
  TestRow,
} from "@/lib/professional-identity/home-presentation";
import { L, Lf, Lp, type Lang } from "./copy";
import {
  APPLICATIONS,
  APPLICATION_STATUS,
  CLASSIFICATION,
  EMPLOYER_WORK,
  TEST_PHASE,
} from "./home-copy";
import { Chip, Failed, Group, Loading, SubHeading } from "./home-primitives";
import { LINK, formatDay } from "./home-format";

function TestItem({ t }: { t: TestRow }) {
  const { lang } = useT();
  const l = lang as Lang;
  const who = t.employerName
    ? t.useCase === "recruitment"
      ? Lf(EMPLOYER_WORK.requestedBy, l, t.employerName)
      : Lf(EMPLOYER_WORK.assignedBy, l, t.employerName)
    : null;
  const role = l === "sv" ? t.jobTitleSv : t.jobTitleEn;
  // The instrument's own name leads; the purpose is shown only when it adds
  // a word the name does not already carry ("Rekryteringstest ·
  // Rekryteringstest" was the two coinciding).
  const name = l === "sv" ? (t.titleSv ?? t.purposeSv) : (t.titleEn ?? t.purposeEn);
  const purpose = l === "sv" ? t.purposeSv : t.purposeEn;
  const title =
    purpose && name && !name.toLowerCase().includes(purpose.toLowerCase())
      ? `${name} · ${purpose}`
      : name;
  const deadline = t.phase === "action" ? formatDay(t.deadline, l) : null;
  const released = t.phase === "released" ? formatDay(t.releasedAt, l) : null;
  const chip =
    t.phase === "action"
      ? L(CLASSIFICATION.action_required, l)
      : t.phase === "waiting"
        ? L(CLASSIFICATION.in_progress_no_action, l)
        : L(TEST_PHASE[t.phase], l);

  return (
    <li
      className="py-3"
      data-test-row={t.phase}
      data-featured-above={t.featuredAbove ? "" : undefined}
    >
      <Chip label={chip} />
      <p className="mt-1 text-sm font-medium text-balance text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[who, role ? Lf(EMPLOYER_WORK.forRole, l, role) : null].filter(Boolean).join(" ")}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t.phase === "action" &&
          [
            Lf(EMPLOYER_WORK.progress, l, `${t.answered}/${t.totalItems}`),
            deadline ? Lf(EMPLOYER_WORK.deadline, l, deadline) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        {t.phase === "released" && released && (
          <time dateTime={t.releasedAt ?? undefined}>
            {Lf(EMPLOYER_WORK.released, l, released)}
          </time>
        )}
        {t.phase === "waiting" && L(TEST_PHASE.waiting, l)}
        {t.phase === "unknown" && `${L(TEST_PHASE.unknown, l)} (${t.rawStatus})`}
      </p>
      {t.featuredAbove ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {L(EMPLOYER_WORK.testFeaturedAbove, l)}
        </p>
      ) : t.href ? (
        <Link to={t.href} className={`${LINK} mt-1`} data-test-link={t.attemptId}>
          {t.phase === "released" ? L(EMPLOYER_WORK.readResult, l) : L(EMPLOYER_WORK.open, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}

export function EmployerProcesses({
  applications,
  work,
  onRetryApplications,
  onRetryWork,
  children,
  className,
}: {
  applications: ApplicationsModel;
  work: EmployerWorkModel;
  onRetryApplications?: () => void;
  onRetryWork?: () => void;
  /** The offer to link an earlier result. */
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const tests = work.state === "ready" ? work.tests : [];
  const listed = tests.filter((t) => t.phase !== "waiting");
  const waiting = work.state === "ready" ? work.waitingCount : 0;
  const onlyFeatured =
    work.state === "ready" &&
    work.totalTests > 0 &&
    listed.every((t) => t.featuredAbove) &&
    waiting === 0;

  return (
    <Group
      id="employer-processes"
      title={L(EMPLOYER_WORK.heading, l)}
      className={className}
      data-employer-processes=""
    >
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* ---- Applications ------------------------------------------- */}
        <div data-applications data-applications-state={applications.state}>
          <SubHeading id="applications-heading">
            <span className="mr-2 inline-block align-[-2px] text-accent" aria-hidden="true">
              <FileText className="h-4 w-4" />
            </span>
            {L(APPLICATIONS.title, l)}
          </SubHeading>
          {applications.state === "loading" ? (
            <Loading label={L(APPLICATIONS.loading, l)} className="mt-3" />
          ) : applications.state === "unavailable" ? (
            <Failed
              message={L(APPLICATIONS.unavailable, l)}
              onRetry={onRetryApplications}
              href="/my-career/applications"
              hrefLabel={L(APPLICATIONS.cta, l)}
              className="mt-2"
            />
          ) : (
            <>
              {applications.activeCount === 0 && applications.concludedCount === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{L(APPLICATIONS.none, l)}</p>
              ) : (
                <>
                  <p
                    className="mt-2 text-sm font-medium text-foreground"
                    data-active-applications={applications.activeCount}
                  >
                    {applications.activeCount > 0
                      ? Lp(APPLICATIONS.active, l, applications.activeCount)
                      : Lp(APPLICATIONS.onlyHistory, l, applications.concludedCount)}
                  </p>
                  {applications.latestActive && (
                    <p className="mt-1 text-sm text-muted-foreground" data-latest-application>
                      {[
                        l === "sv"
                          ? applications.latestActive.jobTitleSv
                          : applications.latestActive.jobTitleEn,
                        applications.latestActive.employerName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {" — "}
                      {L(APPLICATION_STATUS[applications.latestActive.status], l)}
                    </p>
                  )}
                  {applications.interviewCount > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Lp(APPLICATIONS.interviews, l, applications.interviewCount)}
                    </p>
                  )}
                </>
              )}
              <div className="mt-2">
                <Link to="/my-career/applications" className={LINK}>
                  {L(APPLICATIONS.cta, l)}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                {applications.activeCount > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {L(APPLICATIONS.disclosureHint, l)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ---- Tests and results -------------------------------------- */}
        <div data-tests-and-results data-tests-state={work.state}>
          <SubHeading id="tests-heading">
            <span className="mr-2 inline-block align-[-2px] text-accent" aria-hidden="true">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            {L(EMPLOYER_WORK.testsTitle, l)}
          </SubHeading>
          {work.state === "loading" ? (
            <Loading label={L(EMPLOYER_WORK.loading, l)} className="mt-3" />
          ) : work.state === "unavailable" ? (
            <Failed
              message={L(EMPLOYER_WORK.unavailable, l)}
              onRetry={onRetryWork}
              href="/academy"
              hrefLabel={L(EMPLOYER_WORK.all, l)}
              className="mt-2"
            />
          ) : work.totalTests === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground" data-tests-none>
              {L(EMPLOYER_WORK.testsNone, l)}
            </p>
          ) : onlyFeatured ? (
            <p className="mt-2 text-sm text-muted-foreground" data-tests-featured-above>
              {L(EMPLOYER_WORK.testFeaturedAbove, l)}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {listed.map((t) => (
                <TestItem key={t.id} t={t} />
              ))}
              {waiting > 0 && (
                <li className="py-3" data-test-row="waiting">
                  <Chip label={L(CLASSIFICATION.in_progress_no_action, l)} />
                  <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
                    {Lp(EMPLOYER_WORK.waiting, l, waiting)}
                  </p>
                </li>
              )}
            </ul>
          )}
          {work.state === "ready" && tests.some((t) => t.phase === "released") && (
            <p className="mt-2 max-w-[56ch] text-xs text-muted-foreground">
              {L(EMPLOYER_WORK.resultNotEvidence, l)}
            </p>
          )}
          {work.state === "ready" && work.totalTests > 0 && (
            <Link to="/academy" className={`${LINK} mt-2`}>
              {L(EMPLOYER_WORK.all, l)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          {children}
        </div>
      </div>
    </Group>
  );
}
