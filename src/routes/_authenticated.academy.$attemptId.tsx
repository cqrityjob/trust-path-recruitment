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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { listAcademyWork } from "@/lib/security-competency/academy-training.functions";
import { createAnswerQueue } from "@/lib/security-competency/answer-queue";
import {
  MissingAnswersPanel,
  SaveStatus,
  SubmittedNotice,
  type SaveState,
} from "@/components/academy/AttemptPanels";

export const Route = createFileRoute("/_authenticated/academy/$attemptId")({
  component: AcademyAttemptRoute,
});

type Phase =
  | "loading"
  | "intro"
  | "section"
  | "running"
  | "submitting"
  | "done"
  | "error"
  /** A final submission that did not go through. Deliberately NOT "error":
   *  the run is intact and resumable, and the copy has to say so. */
  | "submit-failed"
  /** Submit was refused because answers are missing. Deliberately NOT
   *  "submit-failed": nothing failed, nothing was lost and retrying the same
   *  call would be refused again for the same reason. The only useful thing to
   *  show here is WHICH answers are missing and a way to get to them. */
  | "incomplete";

/** Whether an item already carries a saved answer.
 *
 *  One definition, used by both the progress count and the resume point, so
 *  "12 answered" and "resume at 13" can never disagree. Best/worst counts only
 *  when BOTH halves are saved — a half-answered pairing is not an answer, and
 *  submit would refuse it. */
function isAnswered(i: AcademyItem): boolean {
  return Boolean(i.savedOptionId || (i.savedBestId && i.savedWorstId) || i.savedText);
}

/** What `scp_save_response` will actually store for a written answer.
 *
 *  The function writes `nullif(btrim(text), '')`, so trailing whitespace is
 *  discarded and a whitespace-only answer becomes NULL. Applying the same
 *  normalisation locally is what stops the run from showing an answer the
 *  database threw away — which reads as saved, survives until a reload, and
 *  then is not there. */
function asStored(text: string): string | null {
  return text.trim() === "" ? null : text.trim();
}

/** How long typing waits before it is sent.
 *
 *  Short enough that the unsaved window is a pause in typing rather than a
 *  policy, and long enough not to post per keystroke. It is deliberately NOT
 *  the mechanism that gets the answer in: every exit — blur, next, back,
 *  submit, unmount — flushes it first, so lengthening this would not lose an
 *  answer and shortening it would not save one. */
const TEXT_SAVE_DELAY_MS = 800;

function AcademyAttemptRoute() {
  const { attemptId } = Route.useParams();
  const { t, tp, lang: uiLang } = useT();
  const loadItems = useServerFn(getAcademyAttemptItems);
  const loadBlocks = useServerFn(getAcademyAttemptBlocks);
  const loadState = useServerFn(getAcademyAttemptState);
  const saveResponse = useServerFn(saveAcademyResponse);
  const submitAttempt = useServerFn(submitAcademyAttempt);
  const loadWork = useServerFn(listAcademyWork);

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
  // Purpose. An assessment assigned in RECRUITMENT may not be introduced with
  // the employee competence-development wording -- see academy.intro.purpose
  // in the dictionaries for what was wrong with saying it to an applicant.
  // Read from the participant's own work list (scp_my_academy_work already
  // returns use_case, scoped to the caller) rather than inventing a second
  // read model for one string.
  const [useCase, setUseCase] = useState<"workforce" | "recruitment">("workforce");
  const recruitment = useCase === "recruitment";
  // Per-item save state, keyed by item version id. Absent means "nothing has
  // been sent for this item in this sitting" — which is NOT "unsaved": a
  // resumed run arrives with its answers already on the server.
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  // The items the SERVER says have no answer. Established by re-reading at
  // submit time, never by trusting this component's copy.
  const [missing, setMissing] = useState<AcademyItem[]>([]);

  // ── HOW AN ANSWER REACHES THE SERVER ──────────────────────────────────
  //
  // Answers are persisted in the background, which is right while somebody is
  // working: it keeps the UI instant. Two rules make that safe rather than
  // merely fast, and both are here because their absence loses answers.
  //
  // ONE WRITE AT A TIME, PER ITEM, and submit waits for all of them. Both
  // rules live in `createAnswerQueue`, with the reasoning for each — they are
  // the reliability-critical part of this file and they are testable there
  // rather than only reachable through a component.
  //
  // WHAT IS SENT IS THE WHOLE ANSWER, merged from the item as it stands after
  // the change rather than from this render's closure — see `answer()`.
  const queue = useRef(createAnswerQueue());
  // `submittingRef` makes the submit itself single-flight. A ref, not state:
  // it updates synchronously, so a second click that lands before React
  // re-renders still sees it — which is the click that would otherwise run
  // scp_submit_attempt twice.
  const submittingRef = useRef(false);

  // ── THE WRITTEN ANSWER, WHICH IS THE ONE THAT CAN BE LOST ─────────────
  //
  // A chosen option is one click and is saved on that click. A written answer
  // is eight minutes of typing, and it used to reach the server only on blur.
  // Everything before the first blur — the whole answer, usually — existed in
  // one browser tab and nowhere else: a reload, a crash or a sleeping laptop
  // took it, and the participant came back to an empty box.
  //
  // So typing schedules a save, and anything that could end the sitting
  // flushes it first: moving between questions, submitting, unmounting, and
  // leaving the page. The debounce is short and is never the thing relied on —
  // it exists to avoid a request per keystroke, not to be a deadline.
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textDirty = useRef<{ itemId: string; value: string } | null>(null);
  // The latest items, readable synchronously. Two clicks inside one frame both
  // read this; reading `items` would give the second one the state from before
  // the first, and it would send — and store — the answer without it.
  const itemsRef = useRef<AcademyItem[]>([]);
  // Set when the participant was SENT to a question rather than walking to it,
  // so the focus follows them. Routing somebody to question 31 and leaving the
  // keyboard where it was is a routing that only worked for people using a
  // mouse.
  const focusPrompt = useRef(false);
  const promptRef = useRef<HTMLHeadingElement | null>(null);

  const lang = uiLang === "en" ? "en" : "sv";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rows, blockRows, state, work] = await Promise.all([
          loadItems({ data: { attemptId, locale: lang } }),
          loadBlocks({ data: { attemptId, locale: lang } }),
          loadState({ data: { attemptId } }),
          // Purpose only. Never allowed to fail the page: if the work list is
          // unavailable the run still opens, under the neutral default.
          loadWork().catch(() => []),
        ]);
        if (cancelled) return;
        setItems(rows);
        itemsRef.current = rows;
        setBlocks(blockRows);
        const mine = work.find((w) => w.workId === attemptId);
        if (mine) setUseCase(mine.useCase);
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
  }, [attemptId, lang, loadItems, loadBlocks, loadState, loadWork]);

  /** Send one item's complete answer, behind that item's own queue.
   *
   *  A failing save no longer ends the run. It used to set phase "error",
   *  which drew "This assessment could not be opened" over an assessment that
   *  had opened, was fully answered and was still perfectly resumable — the
   *  participant's honest reading of that screen is that everything is gone.
   *  What is true is narrower and is said where it happened: THIS answer is
   *  not saved. The run continues, the other answers are untouched, and submit
   *  re-reads from the server anyway, so an answer this failed to store shows
   *  up there as missing rather than being quietly submitted as blank. */
  function persist(itemId: string, a: AcademyItem): Promise<void> {
    return queue.current.enqueue(itemId, async () => {
      setSaveState((prev) => ({ ...prev, [itemId]: "saving" }));
      try {
        await saveResponse({
          data: {
            attemptId,
            itemVersionId: itemId,
            selectedOptionId: a.savedOptionId,
            bestOptionId: a.savedBestId,
            worstOptionId: a.savedWorstId,
            responseText: a.savedText,
          },
        });
        // Set from the REPLY. This is the whole save contract: the run may not
        // tell somebody their answer is saved on the strength of having sent
        // it, because the two are different facts and only one of them
        // survives a closed laptop.
        setSaveState((prev) => ({ ...prev, [itemId]: "saved" }));
      } catch {
        setSaveState((prev) => ({ ...prev, [itemId]: "failed" }));
      }
    });
  }

  /** Record an answer and persist it.
   *
   *  The patch is merged onto the item as it stands NOW — read from `itemsRef`
   *  and written back to it synchronously — rather than onto the copy this
   *  render closed over. Best/worst is why: the two halves are two clicks, and
   *  a second click landing before React re-renders would otherwise send the
   *  half it remembered and store the pairing without the other one. */
  const answer = useCallback(
    (itemId: string, patch: Partial<AcademyItem>) => {
      const base = itemsRef.current.find((i) => i.itemVersionId === itemId);
      if (!base) return;
      const merged: AcademyItem = { ...base, ...patch };
      itemsRef.current = itemsRef.current.map((i) => (i.itemVersionId === itemId ? merged : i));
      setItems((prev) => prev.map((i) => (i.itemVersionId === itemId ? merged : i)));
      void persist(itemId, merged);
    },
    // `persist` is redeclared each render and closes only over refs and stable
    // setters, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Send the written answer now, cancelling any save this typing scheduled.
   *
   *  Called before anything that could end the sitting. Returns nothing to
   *  await on purpose: the write it starts is in `chains`, and
   *  `flushPendingSaves` is what waits for it. */
  const flushText = useCallback(() => {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    const dirty = textDirty.current;
    if (!dirty) return;
    textDirty.current = null;
    answer(dirty.itemId, { savedText: asStored(dirty.value) });
  }, [answer]);

  /** Wait for every answer still being written. Never rejects — a save that
   *  failed has already said so on its own question, and must not leave submit
   *  hanging on it forever. */
  function flushPendingSaves(): Promise<void> {
    return queue.current.drain();
  }

  // ── THE SITTING ENDING WITHOUT A CLICK ────────────────────────────────
  //
  // Unmounting (navigating away inside the app) flushes: the save is started
  // and the browser keeps the request alive. Leaving the page entirely cannot
  // be made to wait, so the only honest thing is to say so first — and only
  // when something really is unsaved, because a confirmation dialog that
  // appears every time is one people learn to dismiss without reading.
  useEffect(() => {
    // `textDirty` is set on every keystroke and cleared only by a flush, so
    // between them it IS the unsaved buffer; the queue holds the writes
    // already on their way. Nothing else can be outstanding.
    const unsaved = () => textDirty.current !== null || queue.current.size() > 0;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      e.preventDefault();
      // Browsers show their own wording; the value only has to be set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushText();
    };
  }, [flushText]);

  const current = items[index];
  const answered = useMemo(() => items.filter(isAnswered).length, [items]);

  useEffect(() => {
    if (phase !== "running" || !focusPrompt.current) return;
    focusPrompt.current = false;
    promptRef.current?.focus();
  }, [phase, index]);
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
      // Leaving the question is the moment the written answer has to be on its
      // way. Not a delay — the save is started here, and submit waits for it.
      flushText();
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
    [items, blockOf, current?.blockKey, introsSeen, flushText],
  );

  // ── LOADING THE WRITTEN ANSWER INTO THE BOX, ONCE PER ITEM ────────────
  //
  // Keyed on which item the box is currently holding, not on the saved value.
  // Reacting to the value as well meant that every save re-ran this and wrote
  // the stored answer back over the box — so a normalisation as small as a
  // trimmed trailing space moved the caret while somebody was still typing.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = current?.itemVersionId;
    if (!id || loadedFor.current === id) return;
    loadedFor.current = id;
    setText(current?.savedText ?? "");
  }, [current?.itemVersionId, current?.savedText]);

  /** Ask the server what it is actually holding, and route to what is missing.
   *
   *  ── WHY THIS ASKS RATHER THAN LOOKS ──────────────────────────────────
   *
   *  "You are missing an answer" is a sentence that must not be said from this
   *  component's copy of the run. That copy can be stale — a second tab, a
   *  save that failed, a resumed sitting — and being wrong in either direction
   *  is bad: refusing to submit a finished run, or naming a question that is
   *  in fact answered. The server is asked, once, at the one moment it
   *  matters, and its answer replaces the local copy.
   *
   *  Returns the items with no answer, in form order. */
  async function readMissing(): Promise<AcademyItem[]> {
    const fresh = await loadItems({ data: { attemptId, locale: lang } });
    setItems(fresh);
    itemsRef.current = fresh;
    return fresh.filter((i) => !isAnswered(i));
  }

  /** Go to a question that has no answer, and put the focus on it. */
  function goToMissing(item: AcademyItem) {
    const at = itemsRef.current.findIndex((i) => i.itemVersionId === item.itemVersionId);
    if (at >= 0) setIndex(at);
    setMissing([]);
    focusPrompt.current = true;
    setPhase("running");
  }

  async function onSubmit() {
    // Single-flight. A ref, not state: it updates synchronously, so a second
    // click that lands before React re-renders still sees the flag — which a
    // state flag would miss, and which would run scp_submit_attempt twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Anything typed and not yet sent becomes a save before we go any further.
    flushText();
    setPhase("submitting");
    try {
      // The last answer's save may still be in flight when this runs;
      // submitting past it makes the database correctly report an incomplete
      // attempt for a run that is, a few hundred milliseconds later, complete.
      await flushPendingSaves();

      // ── WHAT IS MISSING IS SAID BEFORE THE REFUSAL, NOT AFTER IT ──────
      //
      // scp_submit_attempt requires an answer to every item and says so in the
      // aggregate ("3 of 47 items have no answer"). That arrived here as a
      // panel with a "Submit again" button, which is the one action guaranteed
      // to fail for exactly the same reason. Asking first turns the same fact
      // into three named questions and a way to reach the first.
      const gaps = await readMissing();
      if (gaps.length > 0) {
        setMissing(gaps);
        setPhase("incomplete");
        return;
      }

      const res = await submitAttempt({ data: { attemptId } });
      setOutcome({ reviewsOpened: res.reviewsOpened });
      setPhase("done");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "submit_failed";
      // ── IDEMPOTENCY ────────────────────────────────────────────────────
      //
      // "not_open" means the attempt is no longer in progress, which after a
      // submit means it is already IN. That is the success case arriving by
      // an unusual route (a retry after a dropped response, a double click
      // whose first call won), and telling the participant it failed would be
      // false — and would invite them to try again at something that is done.
      if (code === "not_open") {
        setOutcome({ reviewsOpened: 0 });
        setPhase("done");
        return;
      }
      // Otherwise ask the server what actually happened before saying
      // anything. A response lost on the wire looks identical to a refusal
      // from here, and only one of those is a failure.
      try {
        const state = await loadState({ data: { attemptId } });
        if (state && !state.isOpen) {
          setClosedStatus(state.status);
          setPhase("done");
          return;
        }
      } catch {
        // The state read is a courtesy. Its failure is not new information.
      }
      // The server refused for completeness after we had just checked. That
      // means the run changed underneath this one (a second tab, a save that
      // landed as blank), so ask again rather than arguing with it — and show
      // the same named list, never a retry of a call that will be refused.
      if (code === "incomplete" || code === "incomplete_best_worst") {
        try {
          const gaps = await readMissing();
          if (gaps.length > 0) {
            setMissing(gaps);
            setPhase("incomplete");
            return;
          }
        } catch {
          // Fall through to the general refusal below.
        }
      }
      // A genuine refusal, with the attempt still open. NOT the load-failure
      // panel: nothing is lost, the answers are all saved, and the run is
      // resumable — so the participant is told that, and offered the button.
      setErrorCode(code);
      setPhase("submit-failed");
    } finally {
      submittingRef.current = false;
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

  // A submission that did not go through. Distinct from the load-failure panel
  // above in every way that matters to the person reading it: the title does
  // not claim the assessment could not be opened (it opened; they answered all
  // of it), the body says the answers are saved, and there is a button.
  // Answers are missing. NOT a failure, and deliberately not the panel above:
  // there is nothing to retry, so there is no retry button — the only action
  // that helps is going to a question that has no answer, and it is offered by
  // name rather than as a number the participant has to go hunting through.
  // Answers are missing. NOT a failure, and deliberately not the panel below:
  // there is nothing to retry, so there is no retry button — see
  // MissingAnswersPanel for why that distinction is the whole point.
  if (phase === "incomplete") {
    return (
      <AssessmentShell showExit>
        <AssessmentPanel>
          <MissingAnswersPanel
            missing={missing.map((m) => ({
              itemVersionId: m.itemVersionId,
              // Its number in the run as the participant counts it.
              position: items.findIndex((i) => i.itemVersionId === m.itemVersionId) + 1,
              prompt: m.prompt,
            }))}
            onGoTo={(m) => {
              const item = itemsRef.current.find((i) => i.itemVersionId === m.itemVersionId);
              if (item) goToMissing(item);
            }}
            onBack={() => {
              setMissing([]);
              setPhase("running");
            }}
          />
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "submit-failed") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-accent" aria-hidden="true" />
            {t("academy.submitFailed.title")}
          </h1>
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            {t("academy.submitFailed.body")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onSubmit()}
              className="inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.submitFailed.retry")}
            </button>
            <button
              type="button"
              onClick={() => setPhase("running")}
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-border px-6 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.submitFailed.review")}
            </button>
          </div>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (phase === "intro") {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            {t(recruitment ? "academy.eyebrowRecruitment" : "academy.eyebrow")}
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
            {t(recruitment ? "academy.intro.purposeRecruitment" : "academy.intro.purpose")}
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
          <SubmittedNotice
            recruitment={recruitment}
            closedStatus={closedStatus}
            reviewsOpened={outcome?.reviewsOpened ?? 0}
          />
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
          <h2
            ref={promptRef}
            tabIndex={-1}
            className="mt-4 text-lg font-semibold leading-snug tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
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
                    onSelect={() =>
                      answer(current.itemVersionId, {
                        savedOptionId: o.optionId,
                        // One choice replaces the whole answer, because
                        // scp_save_response replaces the whole row. Saying so
                        // here keeps what is sent identical to what is shown.
                        savedBestId: null,
                        savedWorstId: null,
                        savedText: null,
                      })
                    }
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
                          onSelect={() =>
                            // Only the half that was clicked. `answer` merges
                            // it onto the item as it stands now and sends both,
                            // so choosing "worst" a tick after "best" can no
                            // longer store the pairing without the "best".
                            answer(
                              current.itemVersionId,
                              which === "best"
                                ? { savedBestId: o.optionId }
                                : { savedWorstId: o.optionId },
                            )
                          }
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
                  onChange={(e) => {
                    const value = e.target.value;
                    setText(value);
                    textDirty.current = { itemId: current.itemVersionId, value };
                    if (textTimer.current) clearTimeout(textTimer.current);
                    textTimer.current = setTimeout(flushText, TEXT_SAVE_DELAY_MS);
                  }}
                  // Blur still saves immediately. The debounce above is for
                  // the minutes BETWEEN blurs, which is where a written answer
                  // used to live entirely in one browser tab.
                  onBlur={flushText}
                  className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder={t("academy.writtenPlaceholder")}
                />
                <p className="mt-2 text-xs text-muted-foreground">{t("academy.writtenNote")}</p>
              </div>
            )}
          </div>

          <SaveStatus
            state={saveState[current.itemVersionId]}
            // An empty patch on purpose: retrying sends the answer exactly as
            // it stands, which is the answer the participant already gave and
            // can still see. Nothing about it is re-asked.
            onRetry={() => answer(current.itemVersionId, {})}
          />
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
