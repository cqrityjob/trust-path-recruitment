// The one line that answers "where am I, and what comes next" on every
// recruitment surface. The same seven steps in the same order on the overview,
// the recruitment list, the application list, the tests, the interviews and
// the reports -- so the menu's four areas read as stations on one journey
// rather than four products. Each step links to the surface where that work
// is done; the current step is marked for sighted readers and screen readers
// alike. Nothing here counts anything.
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

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
  const linkClass = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-accent/10 text-accent"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );
  const label = (step: RecruitmentFlowStep) => t(`rec.flow.${step}` as TranslationKey);
  const marker = (step: RecruitmentFlowStep) =>
    step === current ? <span className="sr-only"> ({t("rec.flow.current")})</span> : null;
  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />;

  return (
    <nav
      aria-label={t("rec.overview.flowHeading")}
      data-testid="recruitment-flow"
      data-current={current ?? "overview"}
      className={cn("overflow-x-auto", className)}
    >
      <ol className="flex min-w-max items-center gap-0.5">
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/jobs"
            params={params}
            className={linkClass(current === "requirements")}
            aria-current={current === "requirements" ? "step" : undefined}
          >
            {label("requirements")}
            {marker("requirements")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/applications"
            params={params}
            className={linkClass(current === "applications")}
            aria-current={current === "applications" ? "step" : undefined}
          >
            {label("applications")}
            {marker("applications")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/applications"
            params={params}
            search={{ stage: "received" as const, review: "remaining" as const }}
            className={linkClass(current === "review")}
            aria-current={current === "review" ? "step" : undefined}
          >
            {label("review")}
            {marker("review")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/assessments"
            params={params}
            className={linkClass(current === "tests")}
            aria-current={current === "tests" ? "step" : undefined}
          >
            {label("tests")}
            {marker("tests")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/interview-intelligence"
            params={params}
            className={linkClass(current === "interviews")}
            aria-current={current === "interviews" ? "step" : undefined}
          >
            {label("interviews")}
            {marker("interviews")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/reports"
            params={params}
            className={linkClass(current === "report")}
            aria-current={current === "report" ? "step" : undefined}
          >
            {label("report")}
            {marker("report")}
          </Link>
          {sep}
        </li>
        <li className="flex items-center gap-0.5">
          <Link
            to="/employer/$employerSlug/jobs"
            params={params}
            search={{ phase: "closed" as const }}
            className={linkClass(current === "decision")}
            aria-current={current === "decision" ? "step" : undefined}
          >
            {label("decision")}
            {marker("decision")}
          </Link>
        </li>
      </ol>
    </nav>
  );
}
