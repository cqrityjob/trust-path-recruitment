// Learning Mode.
//
// ── THE SHAPE OF A PRACTICE QUESTION ──────────────────────────────────
//
// Answer first, feedback second, move on third. The feedback is fetched only
// after an answer is saved, so the preferred response is never in the payload
// of a question the learner has not yet attempted.
//
// The feedback shows every option, not just the chosen one, and says why the
// weaker alternatives are weaker. Naming only the right answer teaches
// recognition; explaining the wrong ones teaches judgement, and judgement is
// what the programme is about.
//
// Multiple attempts are expected: a completed run never blocks a fresh one, and
// the button says so.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, GraduationCap, Lightbulb } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import {
  AssessmentCard,
  AssessmentNavigation,
  AssessmentProgressBar,
  SelectableAnswer,
} from "@/components/career-discovery/v31/shell/QuestionCard";
import {
  getAcademyAttemptItems,
  saveAcademyResponse,
  type AcademyItem,
} from "@/lib/security-competency/academy-delivery.functions";
import {
  completeLearningModule,
  getLearningFeedback,
  startLearningAttempt,
  type LearningFeedbackOption,
} from "@/lib/security-competency/academy-learning.functions";

export const Route = createFileRoute("/_authenticated/academy/learning/$formId")({
  ssr: false,
  component: LearningRoute,
});

type Phase = "loading" | "running" | "done" | "error";

function LearningRoute() {
  const { formId } = Route.useParams();
  const { t, lang } = useT();
  const start = useServerFn(startLearningAttempt);
  const loadItems = useServerFn(getAcademyAttemptItems);
  const save = useServerFn(saveAcademyResponse);
  const feedbackFn = useServerFn(getLearningFeedback);
  const complete = useServerFn(completeLearningModule);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [items, setItems] = useState<AcademyItem[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [feedback, setFeedback] = useState<LearningFeedbackOption[] | null>(null);

  const locale = lang === "en" ? "en" : "sv";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { attemptId: id } = await start({ data: { formId } });
        if (cancelled) return;
        const rows = await loadItems({ data: { attemptId: id, locale } });
        if (cancelled) return;
        setAttemptId(id);
        setItems(rows);
        setPhase(rows.length > 0 ? "running" : "error");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId, locale, start, loadItems]);

  const current = items[index];

  // Feedback belongs to one question. Clearing it on navigation is what stops
  // the previous question's answer being visible under the next one.
  useEffect(() => {
    setFeedback(null);
  }, [current?.itemVersionId]);

  const answer = useCallback(
    async (optionId: string) => {
      if (!attemptId || !current) return;
      await save({
        data: {
          attemptId,
          itemVersionId: current.itemVersionId,
          selectedOptionId: optionId,
          bestOptionId: null,
          worstOptionId: null,
          responseText: null,
        },
      });
      setItems((prev) =>
        prev.map((i) =>
          i.itemVersionId === current.itemVersionId ? { ...i, savedOptionId: optionId } : i,
        ),
      );
      const fb = await feedbackFn({
        data: { attemptId, itemVersionId: current.itemVersionId, locale },
      });
      setFeedback(fb);
    },
    [attemptId, current, save, feedbackFn, locale],
  );

  if (phase === "loading") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "error") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <h1 className="text-lg font-semibold text-foreground">{t("academy.error.title")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("academy.learning.unavailable")}</p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "done") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
            {t("academy.learning.doneTitle")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("academy.learning.doneBody")}
          </p>
          {/* Said plainly: practice counts, but it counts lightly. */}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("academy.learning.doneWeight")}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/academy"
              className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.learning.backHome")}
            </Link>
          </div>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (!current) return null;
  const hasFeedback = (feedback?.length ?? 0) > 0;
  const answered = items.filter((i) => i.savedOptionId).length;
  const isLast = index === items.length - 1;

  return (
    <AssessmentShell showExit>
      <AssessmentCard>
        <AssessmentProgressBar
          stageLabel={t("academy.learning.stage")}
          current={index + 1}
          total={items.length}
          answered={answered}
        />

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <p className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-border bg-[color:var(--surface-subtle)] px-3 py-2 text-xs font-medium text-foreground">
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("academy.learning.badge")}
          </p>

          <p className="text-[15px] leading-relaxed text-muted-foreground">{current.scenario}</p>
          <h2 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-foreground">
            {current.prompt}
          </h2>

          {/* Boolean([]) is true. Disabling on the ARRAY rather than on its
              length locked the learner out whenever feedback came back empty:
              radios frozen, no panel rendered, run stuck with no way forward.
              The control is locked only once there is feedback to read. */}
          <fieldset className="mt-6 space-y-2.5" disabled={hasFeedback}>
            <legend className="sr-only">{current.prompt}</legend>
            {current.options.map((o) => (
              <SelectableAnswer
                key={o.optionId}
                name={current.itemVersionId}
                value={o.optionId}
                checked={current.savedOptionId === o.optionId}
                onSelect={() => void answer(o.optionId)}
              >
                {o.label}
              </SelectableAnswer>
            ))}
          </fieldset>

          {hasFeedback && <FeedbackPanel options={feedback!} />}
        </div>

        <AssessmentNavigation
          onBack={() => setIndex((i) => Math.max(0, i - 1))}
          backDisabled={index === 0}
          forward={
            hasFeedback
              ? isLast
                ? {
                    label: t("academy.learning.finish"),
                    onClick: () => {
                      if (!attemptId) return;
                      void complete({ data: { attemptId } }).then(() => setPhase("done"));
                    },
                  }
                : { label: t("academy.next"), onClick: () => setIndex((i) => i + 1) }
              : undefined
          }
        />
      </AssessmentCard>
    </AssessmentShell>
  );
}

/** Every option, with the reasoning. The learner's own choice is marked, and
 *  the preferred one is marked, and they are allowed to be the same. */
function FeedbackPanel({ options }: { options: LearningFeedbackOption[] }) {
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
