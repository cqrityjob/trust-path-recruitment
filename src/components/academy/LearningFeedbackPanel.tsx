// Learning Mode feedback, shared by standalone practice and by a training
// module's activity.
//
// One implementation on purpose. The rule this panel embodies -- that feedback
// appears only AFTER an answer exists, shows every option with its reasoning,
// and marks the learner's own choice alongside the preferred one -- is a
// governance boundary, not a styling choice. Two copies of it would eventually
// disagree, and the copy that drifts is the one that leaks an answer key.

import { Lightbulb } from "lucide-react";
import { useT } from "@/i18n/context";
import type { LearningFeedbackOption } from "@/lib/security-competency/academy-learning.functions";

/** Every option, with the reasoning. The learner's own choice is marked, and
 *  the preferred one is marked, and they are allowed to be the same. */
export function LearningFeedbackPanel({ options }: { options: LearningFeedbackOption[] }) {
  const { t } = useT();

  return (
    <section
      aria-live="polite"
      className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("academy.learning.feedbackTitle")}
      </h3>

      <ul className="mt-4 space-y-4">
        {options.map((o) => (
          <li key={o.optionId} className="rounded-[10px] border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-[13px] font-semibold text-foreground">{o.label}</p>
              {o.isPreferred && (
                <span className="rounded-full border border-accent px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {t("academy.learning.preferred")}
                </span>
              )}
              {o.chosen && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t("academy.learning.yourChoice")}
                </span>
              )}
            </div>
            {o.feedback && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{o.feedback}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
