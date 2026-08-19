// One training module: the learning content, its activity, and the feedback.
//
// ── SAME ENGINE AS EVERY OTHER QUESTION IN THE PRODUCT ────────────────
//
// Delivery is scp_get_attempt_items, saving is scp_save_response, feedback is
// scp_get_learning_feedback, and the feedback panel is the same component the
// standalone practice runner uses. Nothing about a question is re-implemented
// because it happens to sit inside a development programme.
//
// ── RESUME IS NOT A CODE PATH ─────────────────────────────────────────
//
// startTrainingModule returns the existing in-progress attempt when there is
// one, and scp_get_attempt_items returns the answers already saved against it.
// So arriving for the first time and returning three days later on another
// device run exactly the same lines. There is no restore branch that could rot,
// and progress cannot be lost by a reload because it was never in the client.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, GraduationCap } from "lucide-react";
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
import { LearningFeedbackPanel } from "@/components/academy/LearningFeedbackPanel";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import {
  getAcademyAttemptItems,
  saveAcademyResponse,
  type AcademyItem,
} from "@/lib/security-competency/academy-delivery.functions";
import {
  getLearningFeedback,
  type LearningFeedbackOption,
} from "@/lib/security-competency/academy-learning.functions";
import {
  completeTrainingModule,
  listTrainingModules,
  startTrainingModule,
  type TrainingModule,
} from "@/lib/security-competency/academy-training.functions";

export const Route = createFileRoute(
  "/_authenticated/academy/training/$assignmentId/$moduleVersionId",
)({
  ssr: false,
  component: TrainingModuleRoute,
  errorComponent: EmployerErrorState,
});

type Phase = "loading" | "reading" | "running" | "done" | "error";

function TrainingModuleRoute() {
  const { assignmentId, moduleVersionId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const startFn = useServerFn(startTrainingModule);
  const modulesFn = useServerFn(listTrainingModules);
  const loadItems = useServerFn(getAcademyAttemptItems);
  const save = useServerFn(saveAcademyResponse);
  const feedbackFn = useServerFn(getLearningFeedback);
  const completeFn = useServerFn(completeTrainingModule);

  const [module, setModule] = useState<TrainingModule | null>(null);
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
        const mods = await modulesFn({ data: { assignmentId } });
        const m = mods.find((x) => x.moduleVersionId === moduleVersionId) ?? null;
        if (cancelled) return;
        setModule(m);
        if (!m) {
          setPhase("error");
          return;
        }
        if (m.status === "completed") {
          setPhase("done");
          return;
        }
        // Start or resume. Identical call either way.
        const { attemptId: id } = await startFn({ data: { assignmentId, moduleVersionId } });
        if (cancelled) return;
        setAttemptId(id);
        if (!id) {
          setPhase("reading");
          return;
        }
        const rows = await loadItems({ data: { attemptId: id, locale } });
        if (cancelled) return;
        setItems(rows);
        // Land the learner on the first UNANSWERED question rather than at the
        // top, so resuming continues where they stopped.
        const firstOpen = rows.findIndex((r) => !r.savedOptionId);
        setIndex(firstOpen === -1 ? Math.max(0, rows.length - 1) : firstOpen);
        setPhase(rows.length > 0 ? "running" : "reading");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, moduleVersionId, locale, startFn, modulesFn, loadItems]);

  const current = items[index];

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

  const finish = useCallback(async () => {
    await completeFn({ data: { assignmentId, moduleVersionId } });
    void qc.invalidateQueries({ queryKey: ["academy", "training", assignmentId] });
    void qc.invalidateQueries({ queryKey: ["academy", "work"] });
    setPhase("done");
  }, [completeFn, assignmentId, moduleVersionId, qc]);

  const backLink = (
    <Link
      to="/academy/training/$assignmentId"
      params={{ assignmentId }}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("academy.training.backToProgramme")}
    </Link>
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
          <p className="mt-3 text-sm text-muted-foreground">{t("academy.training.notFoundBody")}</p>
          <div className="mt-6">{backLink}</div>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  const name = module ? (lang === "en" ? module.nameEn : module.nameSv) : "";
  const summary = module ? (lang === "en" ? module.summaryEn : module.summarySv) : null;

  if (phase === "done") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
            {name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("academy.training.notCompetence")}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/academy/training/$assignmentId"
              params={{ assignmentId }}
              className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.training.backToProgramme")}
            </Link>
          </div>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  // A module with content but no activity: read it, then mark it complete.
  if (phase === "reading") {
    return (
      <AssessmentShell>
        {backLink}
        <AssessmentPanel className="mt-4">
          <h1 className="text-lg font-semibold text-foreground">{name}</h1>
          {summary && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
          )}
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.training.noActivity")}
          </p>
          <button
            type="button"
            onClick={() => void finish()}
            className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.training.completeModule")}
          </button>
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
          stageLabel={name}
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

          {/* Locked only once there IS feedback to read -- an empty feedback
              array must not freeze the controls. */}
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

          {hasFeedback ? (
            <LearningFeedbackPanel options={feedback!} />
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              {t("academy.training.answerFirst")}
            </p>
          )}

          <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
            {t("academy.training.savedNotice")}
          </p>
        </div>

        <AssessmentNavigation
          onBack={() => setIndex((i) => Math.max(0, i - 1))}
          backDisabled={index === 0}
          forward={
            hasFeedback || current.savedOptionId
              ? isLast
                ? {
                    label: t("academy.training.completeModule"),
                    onClick: () => void finish(),
                  }
                : { label: t("academy.next"), onClick: () => setIndex((i) => i + 1) }
              : undefined
          }
        />
      </AssessmentCard>
    </AssessmentShell>
  );
}
