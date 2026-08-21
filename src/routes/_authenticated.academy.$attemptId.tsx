// Academy participant delivery.
//
// ── WHY THIS REUSES THE v3.1 SHELL RATHER THAN GROWING ITS OWN ─────────
//
// AssessmentShell, AssessmentCard, AssessmentProgressBar, SelectableAnswer and
// AssessmentNavigation are imported from the existing shell, not copied. A
// second set of answer controls would drift: the originals already solve
// keyboard semantics, focus rings, reduced motion and "never colour alone",
// and a copy would have to solve them again and would eventually solve them
// differently.
//
// What differs from v3.1 is the CONTENT MODEL, not the surface: items arrive
// from the server per attempt instead of from a static bank, and three formats
// exist that Career Discovery does not have. That is handled by rendering
// per format inside the same card.
//
// This route is a participant surface. It is deliberately NOT under
// /employer/$employerSlug/assessments — a participant is not a member of the
// employer's workspace, and putting their run inside the employer's navigation
// would imply an access relationship that does not exist.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, MessageSquare, ShieldAlert } from "lucide-react";
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
  getAcademyAttemptBlocks,
  getAcademyAttemptItems,
  getAcademyAttemptState,
  saveAcademyResponse,
  submitAcademyAttempt,
  type AcademyAttemptState,
  type AcademyBlock,
  type AcademyItem,
} from "@/lib/security-competency/academy-delivery.functions";

export const Route = createFileRoute("/_authenticated/academy/$attemptId")({
  component: AcademyAttemptRoute,
});

type Phase = "loading" | "intro" | "section" | "running" | "submitting" | "done" | "error";

/** Whether an item already carries a saved answer.
 *
 *  One definition, used by both the progress count and the resume point, so
 *  "12 answered" and "resume at 13" can never disagree. Best/worst counts only
 *  when BOTH halves are saved — a half-answered pairing is not an answer, and
 *  submit would refuse it. */
function isAnswered(i: AcademyItem): boolean {
  return Boolean(i.savedOptionId || (i.savedBestId && i.savedWorstId) || i.savedText);
}

function AcademyAttemptRoute() {
  const { attemptId } = Route.useParams();
  const { t, lang: uiLang } = useT();
  const loadItems = useServerFn(getAcademyAttemptItems);
  const loadBlocks = useServerFn(getAcademyAttemptBlocks);
  const loadState = useServerFn(getAcademyAttemptState);
  const saveResponse = useServerFn(saveAcademyResponse);
  const submitAttempt = useServerFn(submitAcademyAttempt);

  const [items, setItems] = useState<AcademyItem[]>([]);
  const [blocks, setBlocks] = useState<AcademyBlock[]>([]);
  // Which section introductions this sitting has already shown. A section
  // intro is worth reading once; making somebody click past it every time they
  // step back through an answer would train them to skip it, which is the
  // opposite of what it is for.
  const [introsSeen, setIntrosSeen] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ reviewsOpened: number } | null>(null);
  // Set when the run was already closed before this visit, so the done screen
  // can say "this is already in" rather than "thank you, just received".
  const [closedStatus, setClosedStatus] = useState<AcademyAttemptState["status"] | null>(null);
  const [text, setText] = useState("");

  const lang = uiLang === "en" ? "en" : "sv";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rows, blockRows, state] = await Promise.all([
          loadItems({ data: { attemptId, locale: lang } }),
          loadBlocks({ data: { attemptId, locale: lang } }),
          loadState({ data: { attemptId } }),
        ]);
        if (cancelled) return;
        setItems(rows);
        setBlocks(blockRows);
        // A closed run never re-enters the player. Reloading the page after
        // handing in used to offer "continue where you left off" and only
        // refuse at the very end, which reads as though the submission had
        // been lost.
        if (state && !state.isOpen) {
          setClosedStatus(state.status);
          setPhase("done");
          return;
        }
        // Resume where the participant actually stopped. The intro button says
        // "continue where you left off", so starting at item 1 and making them
        // click past a dozen answered items would be a small lie. If every item
        // is answered, the last one is the right place to land: that is where
        // the submit control is.
        const firstUnanswered = rows.findIndex((r) => !isAnswered(r));
        setIndex(firstUnanswered === -1 ? Math.max(0, rows.length - 1) : firstUnanswered);
        // An empty list means "not yours, or nothing to answer". The server
        // deliberately does not distinguish those, and neither does this.
        setPhase(rows.length === 0 ? "error" : "intro");
        if (rows.length === 0) setErrorCode("not_found");
      } catch (e) {
        if (cancelled) return;
        setErrorCode((e as { code?: string }).code ?? "load_failed");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, lang, loadItems, loadBlocks, loadState]);

  const current = items[index];
  const answered = useMemo(() => items.filter(isAnswered).length, [items]);
  const blockOf = useCallback(
    (key: string | undefined) => blocks.find((b) => b.blockKey === key) ?? null,
    [blocks],
  );
  const currentBlock = blockOf(current?.blockKey);
  // Where in the item list this section starts, so the counter reads
  // "Question 3 of 10" within the section rather than "Question 23 of 50" —
  // fifty is a number that makes people give up at question twelve.
  const sectionItems = useMemo(
    () => (currentBlock ? items.filter((i) => i.blockKey === currentBlock.blockKey) : items),
    [items, currentBlock],
  );
  const sectionIndex = currentBlock
    ? sectionItems.findIndex((i) => i.itemVersionId === current?.itemVersionId)
    : index;

  /** Move to an item, showing its section introduction first if this sitting
   *  has not shown it yet. Forward moves only: stepping BACK into a section
   *  already begun must not re-interrupt. */
  const goTo = useCallback(
    (next: number, direction: "forward" | "back") => {
      const target = items[next];
      const targetBlock = target ? blockOf(target.blockKey) : null;
      setIndex(next);
      if (
        direction === "forward" &&
        targetBlock &&
        targetBlock.blockKey !== current?.blockKey &&
        !introsSeen.has(targetBlock.blockKey)
      ) {
        setPhase("section");
      }
    },
    [items, blockOf, current?.blockKey, introsSeen],
  );

  // Keep the local copy in step with what was saved, so going back shows the
  // answer that is actually on the server rather than one this component
  // remembers having sent.
  const applyLocal = useCallback((itemId: string, patch: Partial<AcademyItem>) => {
    setItems((prev) => prev.map((i) => (i.itemVersionId === itemId ? { ...i, ...patch } : i)));
  }, []);

  useEffect(() => {
    setText(current?.savedText ?? "");
  }, [current?.itemVersionId, current?.savedText]);

  async function persist(patch: {
    selectedOptionId?: string | null;
    bestOptionId?: string | null;
    worstOptionId?: string | null;
    responseText?: string | null;
  }) {
    if (!current) return;
    try {
      await saveResponse({
        data: {
          attemptId,
          itemVersionId: current.itemVersionId,
          selectedOptionId: patch.selectedOptionId ?? null,
          bestOptionId: patch.bestOptionId ?? null,
          worstOptionId: patch.worstOptionId ?? null,
          responseText: patch.responseText ?? null,
        },
      });
    } catch (e) {
      setErrorCode((e as { code?: string }).code ?? "save_failed");
      setPhase("error");
    }
  }

  async function onSubmit() {
    setPhase("submitting");
    try {
      const res = await submitAttempt({ data: { attemptId } });
      setOutcome({ reviewsOpened: res.reviewsOpened });
      setPhase("done");
    } catch (e) {
      setErrorCode((e as { code?: string }).code ?? "submit_failed");
      setPhase("error");
    }
  }

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
    const key =
      errorCode === "not_found"
        ? "academy.error.notFound"
        : errorCode === "not_open"
          ? "academy.error.notOpen"
          : "academy.error.generic";
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-accent" aria-hidden="true" />
            {t("academy.error.title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(key)}</p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "intro") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            {t("academy.eyebrow")}
          </p>
          <h1
            className="mt-3 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("academy.intro.title")}
          </h1>
          <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            {t("academy.intro.body")}
          </p>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            {t("academy.intro.purpose")}
          </p>
          {/* What the run is made of, before it starts. Fifty questions with no
              visible structure reads as endless; five named sections reads as
              a piece of work. */}
          {blocks.length > 0 && (
            <ol className="mt-7 space-y-2.5">
              {blocks.map((b, i) => (
                <li key={b.blockKey} className="flex gap-3 text-[14px] leading-relaxed">
                  <span className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{b.name}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {b.itemCount} {t("academy.section.questions")}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => {
              const startBlock = blockOf(items[index]?.blockKey);
              setPhase(startBlock && !introsSeen.has(startBlock.blockKey) ? "section" : "running");
            }}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {answered > 0 ? t("academy.resume") : t("academy.start")}
          </button>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  // The section introduction. This is where the participant is told what the
  // next block of questions ASKS — and, for the work-behaviour block, that
  // their answers are reported as a self-description and never as something we
  // observed. Saying that at answering time is the honest place to say it.
  if (phase === "section" && currentBlock) {
    const n = blocks.findIndex((b) => b.blockKey === currentBlock.blockKey) + 1;
    return (
      <AssessmentShell showExit>
        <AssessmentPanel>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            {t("academy.section.eyebrow")} {n} {t("cd.public.of")} {blocks.length}
          </p>
          <h1
            className="mt-3 text-[1.5rem] font-semibold leading-[1.2] tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {currentBlock.name}
          </h1>
          <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground">
            {currentBlock.intro}
          </p>
          <p className="mt-4 max-w-[54ch] rounded-[10px] bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-foreground">
            {t(`academy.asks.${currentBlock.asks}`)}
          </p>
          <p className="mt-4 text-[13px] text-muted-foreground">
            {currentBlock.itemCount} {t("academy.section.questions")}
          </p>
          <button
            type="button"
            onClick={() => {
              setIntrosSeen((prev) => new Set(prev).add(currentBlock.blockKey));
              setPhase("running");
            }}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {t("academy.section.continue")}
          </button>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "submitting") {
    return (
      <AssessmentShell showExit>
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.submitting")}</p>
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
            {t(closedStatus ? "academy.done.alreadyTitle" : "academy.done.title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t(
              closedStatus === "released"
                ? "academy.done.releasedBody"
                : closedStatus
                  ? "academy.done.alreadyBody"
                  : "academy.done.body",
            )}
          </p>
          {/* Said plainly, because a result that is not final yet must not look
              final. */}
          {outcome && outcome.reviewsOpened > 0 && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("academy.done.reviewPending")}
            </p>
          )}
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (!current) return null;

  return (
    <AssessmentShell showExit>
      <AssessmentCard>
        <AssessmentProgressBar
          stageLabel={currentBlock ? currentBlock.name : t("academy.stage")}
          current={sectionIndex + 1}
          total={sectionItems.length}
          answered={answered}
        />

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {currentBlock?.asks === "how_you_usually_work" && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-border bg-[color:var(--surface-subtle)] px-3 py-2 text-xs font-medium text-foreground">
              <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("academy.selfReportBadge")}
            </p>
          )}

          {current.isSafetyCritical && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-border bg-[color:var(--surface-subtle)] px-3 py-2 text-xs font-medium text-foreground">
              <ShieldAlert className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("academy.safetyCritical")}
            </p>
          )}

          <p className="text-[15px] leading-relaxed text-muted-foreground">{current.scenario}</p>
          <h2 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-foreground">
            {current.prompt}
          </h2>

          <div className="mt-6">
            {/* biq_frequency joins the single-choice branch rather than growing
                a control of its own: it is one list of mutually exclusive
                labels, which is exactly what SelectableAnswer already is. What
                differs is what the ANSWER means, and that is said in the
                section introduction and enforced in the evidence model — not
                by drawing a different radio button. */}
            {(current.itemFormat === "sjt_best_response" ||
              current.itemFormat === "sjt_rate_effectiveness" ||
              current.itemFormat === "biq_frequency") && (
              <fieldset className="space-y-2.5">
                <legend className="sr-only">{current.prompt}</legend>
                {current.options.map((o) => (
                  <SelectableAnswer
                    key={o.optionId}
                    name={current.itemVersionId}
                    value={o.optionId}
                    checked={current.savedOptionId === o.optionId}
                    onSelect={() => {
                      applyLocal(current.itemVersionId, { savedOptionId: o.optionId });
                      void persist({ selectedOptionId: o.optionId });
                    }}
                  >
                    {o.label}
                  </SelectableAnswer>
                ))}
              </fieldset>
            )}

            {/* Best/worst is two independent choices over the same options, so
                it is two radio groups rather than one control that has to
                explain itself. */}
            {current.itemFormat === "sjt_best_worst" && (
              <div className="space-y-6">
                {(["best", "worst"] as const).map((which) => (
                  <fieldset key={which} className="space-y-2.5">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                      {which === "best" ? t("academy.bestLegend") : t("academy.worstLegend")}
                    </legend>
                    {current.options.map((o) => {
                      const checked =
                        which === "best"
                          ? current.savedBestId === o.optionId
                          : current.savedWorstId === o.optionId;
                      return (
                        <SelectableAnswer
                          key={`${which}-${o.optionId}`}
                          name={`${current.itemVersionId}-${which}`}
                          value={o.optionId}
                          checked={checked}
                          onSelect={() => {
                            const patch =
                              which === "best"
                                ? { savedBestId: o.optionId }
                                : { savedWorstId: o.optionId };
                            applyLocal(current.itemVersionId, patch);
                            void persist({
                              bestOptionId: which === "best" ? o.optionId : current.savedBestId,
                              worstOptionId: which === "worst" ? o.optionId : current.savedWorstId,
                            });
                          }}
                        >
                          {o.label}
                        </SelectableAnswer>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
            )}

            {current.itemFormat === "constructed_response" && (
              <div>
                <label
                  htmlFor={`cr-${current.itemVersionId}`}
                  className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-accent"
                >
                  {t("academy.writtenAnswer")}
                </label>
                <textarea
                  id={`cr-${current.itemVersionId}`}
                  value={text}
                  maxLength={4000}
                  rows={7}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => {
                    applyLocal(current.itemVersionId, { savedText: text });
                    void persist({ responseText: text });
                  }}
                  className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder={t("academy.writtenPlaceholder")}
                />
                <p className="mt-2 text-xs text-muted-foreground">{t("academy.writtenNote")}</p>
              </div>
            )}
          </div>
        </div>

        <AssessmentNavigation
          onBack={() => goTo(Math.max(0, index - 1), "back")}
          backDisabled={index === 0}
          forward={
            index < items.length - 1
              ? { label: t("academy.next"), onClick: () => goTo(index + 1, "forward") }
              : { label: t("academy.submit"), onClick: () => void onSubmit() }
          }
        />
      </AssessmentCard>
    </AssessmentShell>
  );
}
