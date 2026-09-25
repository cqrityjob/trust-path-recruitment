// The recruitment's five steps, always in view.
//
// 1 Kravprofil → 2 Annons → 3 Publiceringsläge → 4 Ansökningar → 5 Beslut &
// avslut. The same nav on every step of a case, so the recruiter always knows
// where the case is and can move between steps freely: a step's "done" mark
// comes from the data (stepStatesOf), never from having been visited, and
// every step is a link. There is no gate here -- the database decides what
// may change, and each step's own view says so.
//
// The shape is the interview workflow nav's (InterviewUi.tsx): one row that
// scrolls sideways rather than wrapping, the current step a plain
// aria-current span rather than a link to the page you are on, and a
// "Steg 4 av 5" line for the narrow screen where the row may be clipped.

import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import {
  RECRUITMENT_STEPS,
  type RecruitmentStep,
  type StepState,
} from "@/lib/recruitment/definitions";

export const STEP_LABEL: Record<RecruitmentStep, TranslationKey> = {
  requirements: "rec.step.requirements",
  advert: "rec.step.advert",
  publishing: "rec.step.publishing",
  applications: "rec.step.applications",
  closing: "rec.step.closing",
};

export function ProcessStepNav({
  states,
  active,
  employerSlug,
  jobId,
  counts,
}: {
  /** What the data says about each step. */
  states: Record<RecruitmentStep, StepState>;
  /** The step this page is showing -- the reader may be looking at a done
   *  step, which is then highlighted without becoming "current" for the case. */
  active: RecruitmentStep;
  employerSlug: string;
  jobId: string;
  /** A number beside a step, where one means something (applications). */
  counts?: Partial<Record<RecruitmentStep, number>>;
}) {
  const { t } = useT();
  const activeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  const activeIdx = RECRUITMENT_STEPS.indexOf(active);

  return (
    <nav aria-label={t("rec.step.aria")} className="border-b border-border">
      <p className="pb-1.5 text-xs font-medium text-muted-foreground sm:hidden">
        {t("rec.step.stepOf")
          .replace("{n}", String(activeIdx + 1))
          .replace("{total}", String(RECRUITMENT_STEPS.length))}
        {" · "}
        {t(STEP_LABEL[active])}
      </p>
      <ol className="-mb-px flex items-stretch gap-x-0.5 overflow-x-auto text-xs sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RECRUITMENT_STEPS.map((step, i) => {
          const state = states[step];
          const isActive = step === active;
          const isDone = state === "done";
          const isCurrent = state === "current";
          const count = counts?.[step];
          const face = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                  isDone
                    ? "border-teal-700/40 bg-teal-700/10 text-teal-800 dark:text-teal-200"
                    : isCurrent
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                )}
              >
                {isDone ? "✓" : i + 1}
              </span>
              {t(STEP_LABEL[step])}
              {typeof count === "number" && (
                <span className="tabular-nums text-muted-foreground">({count})</span>
              )}
              {isDone && <span className="sr-only"> ({t("rec.step.done")})</span>}
              {isCurrent && <span className="sr-only"> ({t("rec.step.current")})</span>}
            </>
          );
          // `relative` keeps the sr-only spans inside the row: without a
          // positioned ancestor a step scrolled out of view parks an invisible
          // box past the viewport and the page scrolls sideways at 375px.
          const base =
            "relative inline-flex min-h-11 items-center gap-1 whitespace-nowrap border-b-2 px-1.5 py-2.5 transition-colors sm:gap-1.5 sm:px-3";
          return (
            <li key={step} className="shrink-0">
              {isActive ? (
                <span
                  ref={activeRef}
                  aria-current="step"
                  className={cn(base, "border-accent font-semibold text-foreground")}
                >
                  {face}
                </span>
              ) : (
                <Link
                  to="/employer/$employerSlug/jobs/$jobId"
                  params={{ employerSlug, jobId }}
                  search={{ step }}
                  className={cn(
                    base,
                    "border-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  )}
                >
                  {face}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
