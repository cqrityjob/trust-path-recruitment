// The one line that answers "where am I, and what comes next" on every
// recruitment surface. The same seven steps in the same order on the overview,
// the recruitment list, the application list, the tests, the interviews and
// the reports -- so the menu's four areas read as stations on one journey
// rather than four products. Each step links to the surface where that work
// is done; the current step is marked for sighted readers and screen readers
// alike. Nothing here counts anything.
//
// It describes the ORDER of work, not a checklist: tests and interviews are
// used when a recruitment needs them, and the marker says which PAGE the
// reader is on, never that a candidate has reached a step. The lede under the
// strip says so in words, and each station carries a one-line hint. On a
// phone the stations wrap into rows rather than scrolling sideways, so the
// later steps are never off-screen.
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";

export type RecruitmentFlowStep =
  | "requirements"
  | "applications"
  | "review"
  | "tests"
  | "interviews"
  | "report"
  | "decision";

export const RECRUITMENT_FLOW_STEPS: readonly RecruitmentFlowStep[] = [
  "requirements",
  "applications",
  "review",
  "tests",
  "interviews",
  "report",
  "decision",
];

export function RecruitmentFlowStrip({
  employerSlug,
  current,
  className,
}: {
  employerSlug: string;
  /** The step this page belongs to; omitted on the overview, which is the
   *  map rather than a station on it. */
  current?: RecruitmentFlowStep;
  className?: string;
}) {
  const { t } = useT();
  const params = { employerSlug };
  const label = (step: RecruitmentFlowStep) => t(`rec.flow.${step}` as TranslationKey);
  const hint = (step: RecruitmentFlowStep) => t(`rec.flow.hint.${step}` as TranslationKey);
  const linkClass =
    "inline-flex min-h-9 items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  // The router marks a link whose address is the current one; only an exact
  // match (search included) counts, so the two stations that share a route
  // with different filters are never both "current".
  const active = { exact: true, includeSearch: true } as const;
  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />;

  /** The current station is a plain span with aria-current="step", as the
   *  recruitment's own step nav does -- a link to the page you are on is not
   *  a link. Every other station is a link. */
  const Station = ({ step, link }: { step: RecruitmentFlowStep; link: ReactNode }) =>
    current === step ? (
      <span
        aria-current="step"
        title={hint(step)}
        className="inline-flex min-h-9 items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-semibold text-accent"
      >
        {label(step)}
        <span className="sr-only"> ({t("rec.flow.current")})</span>
      </span>
    ) : (
      link
    );

  return (
    <nav
      aria-label={t("rec.overview.flowHeading")}
      data-testid="recruitment-flow"
      data-current={current ?? "overview"}
      className={className}
    >
      <ol className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
        <li className="flex items-center gap-0.5">
          <Station
            step="requirements"
            link={
              <Link
                to="/employer/$employerSlug/jobs"
                params={params}
                activeOptions={active}
                title={hint("requirements")}
                className={linkClass}
              >
                {label("requirements")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="applications"
            link={
              <Link
                to="/employer/$employerSlug/applications"
                params={params}
                activeOptions={active}
                title={hint("applications")}
                className={linkClass}
              >
                {label("applications")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="review"
            link={
              <Link
                to="/employer/$employerSlug/applications"
                params={params}
                search={{ stage: "received" as const, review: "remaining" as const }}
                activeOptions={active}
                title={hint("review")}
                className={linkClass}
              >
                {label("review")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="tests"
            link={
              <Link
                to="/employer/$employerSlug/assessments"
                params={params}
                activeOptions={active}
                title={hint("tests")}
                className={linkClass}
              >
                {label("tests")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="interviews"
            link={
              <Link
                to="/employer/$employerSlug/interview-intelligence"
                params={params}
                activeOptions={active}
                title={hint("interviews")}
                className={linkClass}
              >
                {label("interviews")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="report"
            link={
              <Link
                to="/employer/$employerSlug/reports"
                params={params}
                activeOptions={active}
                title={hint("report")}
                className={linkClass}
              >
                {label("report")}
              </Link>
            }
          />
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Station
            step="decision"
            link={
              <Link
                to="/employer/$employerSlug/jobs"
                params={params}
                search={{ phase: "active" as const }}
                activeOptions={active}
                title={hint("decision")}
                className={linkClass}
              >
                {label("decision")}
              </Link>
            }
          />
        </li>
      </ol>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("rec.flow.lede")}</p>
    </nav>
  );
}
