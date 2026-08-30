// The guided Interview Workspace.
//
// This is the screen a recruiter has open, on a laptop, while a person sits
// opposite them for an hour. Everything about its shape follows from that: one
// question at a time, in type large enough to read while looking up; a notes
// field sized for a real conversation rather than for a form; and a support
// column that answers "what do I ask next" without the recruiter having to
// look away and hunt.
//
// Three properties matter more than anything else here:
//
//   Q1-Q8 ARE THE PACK'S. The wording is rendered verbatim from the pinned
//   version and there is no code path here that edits it. AI does not appear in
//   this screen at all — the interview works with the provider switched off.
//
//   NOTES ARE NOT EVIDENCE. What the interviewer types is a source. Evidence is
//   what a human later confirms, on a different screen, into a different table.
//
//   NO VERDICT DURING THE INTERVIEW. There is no rating control here. Anchors
//   are shown as descriptions of behaviour to listen for, one disclosure away,
//   and the assessment happens after the account is complete.
//
// The save behaviour is unchanged and deliberately fussy: a debounced autosave,
// an explicit flush before any action that moves away from the current
// question, a rollback if a question-state write fails, and a beforeunload
// warning for the one exit the handlers cannot intercept. A note lost mid
// interview cannot be recovered by anybody.

import { createFileRoute, Link } from "@tanstack/react-router";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseStatusChip,
  WorkflowNav,
  Chip,
  LevelZeroNote,
  Panel,
  PEACE_LABEL,
  State,
  GovernedGuidance,
  interviewErrorMessage,
  uiLabel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { Disclosure, Eyebrow } from "@/components/employer/interview/InterviewLayout";
import {
  getInterviewCase,
  saveInterviewNote,
  setQuestionState,
  setSessionState,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/interview",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const STATE_LABEL: Record<string, TranslationKey> = {
  not_started: "iiu.iv.state.not_started",
  in_progress: "iiu.iv.state.in_progress",
  answered: "iiu.iv.state.answered",
  incomplete: "iiu.iv.state.incomplete",
  revisit: "iiu.iv.state.revisit",
  skipped: "iiu.iv.state.skipped",
};

/** Probe purposes that read as "ask this to get the account", versus the two
 *  that read as "check you have understood". Both are governed rows from the
 *  pack; splitting them is presentation, so a recruiter mid-sentence can find
 *  the right one without reading eight. */
const CLARIFY_PURPOSES = ["neutral_check", "correction"];

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const noteFn = useServerFn(saveInterviewNote);
  const qStateFn = useServerFn(setQuestionState);
  const sStateFn = useServerFn(setSessionState);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });

  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteError, setNoteError] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState(false);
  // The draft and its target read through refs as well as state, because
  // flushNote() is called from event handlers that must see the CURRENT value,
  // not the one captured when the handler was created.
  const draftRef = useRef("");
  const storedRef = useRef<{ id: string | null; body: string; questionId: string } | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const saveNote = useMutation({
    mutationFn: (vars: {
      sessionId: string;
      questionId: string;
      body: string;
      noteId: string | null;
    }) =>
      noteFn({
        data: {
          sessionId: vars.sessionId,
          questionId: vars.questionId,
          noteKind: "observation",
          body: vars.body,
          noteId: vars.noteId,
        },
      }),
    onSuccess: () => {
      setSavedAt(new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "sv-SE"));
      setNoteError(false);
      void refresh();
    },
    onError: () => setNoteError(true),
  });
  // Optimistic question state. The chip used to wait for a refetch, so marking
  // a question covered looked like it had done nothing for a beat -- exactly
  // the doubt the owner reported.
  const [pendingState, setPendingState] = useState<Record<string, string>>({});
  const [qStateError, setQStateError] = useState<{
    sessionId: string;
    questionId: string;
    state: "answered" | "incomplete" | "revisit" | "in_progress";
  } | null>(null);
  const setQState = useMutation({
    mutationFn: (vars: {
      sessionId: string;
      questionId: string;
      state: "answered" | "incomplete" | "revisit" | "in_progress";
    }) =>
      qStateFn({
        data: { sessionId: vars.sessionId, questionId: vars.questionId, state: vars.state },
      }),
    onMutate: (vars) => {
      setPendingState((st) => ({ ...st, [vars.questionId]: vars.state }));
      setQStateError(null);
    },
    onSuccess: async (_result, vars) => {
      await refresh();
      setPendingState((st) => {
        const next = { ...st };
        delete next[vars.questionId];
        return next;
      });
    },
    // Roll the chip BACK. An optimistic update with no failure path is a lie
    // told confidently: the chip would keep saying "covered" after the write
    // had failed, which is worse than never showing it early at all.
    onError: (_err, vars) => {
      setPendingState((st) => {
        const next = { ...st };
        delete next[vars.questionId];
        return next;
      });
      setQStateError(vars);
    },
  });
  const setSState = useMutation({
    mutationFn: (vars: {
      sessionId: string;
      status?: "in_progress" | "paused" | "completed";
      peaceStage?: "planning" | "engage_explain" | "account" | "closure" | "evaluation";
      processReflection?: string;
    }) => sStateFn({ data: vars }),
    onSuccess: refresh,
  });

  const d = q.data;
  const session = d?.session ?? null;
  const question = d?.questions[active] ?? null;

  const existingNote =
    session && question ? (session.notes.find((n) => n.questionId === question.id) ?? null) : null;

  // Load the stored note whenever the active question changes.
  useEffect(() => {
    setDraft(existingNote?.body ?? "");
    setSavedAt(null);
    setNoteError(false);
    setBlockedNotice(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  // Mirror into refs so flushNote() always sees the live values.
  draftRef.current = draft;
  storedRef.current = question
    ? { id: existingNote?.id ?? null, body: existingNote?.body ?? "", questionId: question.id }
    : null;
  sessionIdRef.current = session?.id ?? null;

  const noteDirty = storedRef.current !== null && draft !== storedRef.current.body;

  /**
   * Write the pending note NOW and report whether it landed.
   *
   * The debounce used to be cancelled by its own cleanup whenever the
   * interviewer changed question, so a note typed in the last second before
   * pressing Next was discarded without anybody being told. Every action that
   * moves away from the current question awaits this first, and does not
   * proceed unless it returns true.
   *
   * An empty draft over a stored note is a deliberate clearing, not a
   * no-op: the stored body is overwritten so the record stops saying
   * something the interviewer has retracted.
   */
  const flushNote = async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const stored = storedRef.current;
    const sessionId = sessionIdRef.current;
    if (!stored || !sessionId) return true;
    const body = draftRef.current;
    if (body === stored.body) return true;
    // Nothing stored and nothing typed: there is no note to write.
    if (stored.id === null && body.trim() === "") return true;
    try {
      await saveNote.mutateAsync({
        sessionId,
        questionId: stored.questionId,
        body,
        noteId: stored.id,
      });
      return true;
    } catch {
      setNoteError(true);
      return false;
    }
  };

  /** Run an action only if the pending note is safely stored first. */
  const guarded = async (action: () => void | Promise<void>) => {
    const ok = await flushNote();
    if (!ok) {
      setBlockedNotice(true);
      return;
    }
    setBlockedNotice(false);
    await action();
  };

  // Autosave. An interview is a live conversation; nobody should have to
  // remember to press save while a person is talking to them.
  useEffect(() => {
    if (!session || !question) return;
    if (draft === (existingNote?.body ?? "")) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // An empty draft with no stored note is nothing to save; an empty draft
      // OVER a stored note is a clearing, and does save.
      if (draft.trim() === "" && !existingNote?.id) return;
      saveNote.mutate({
        sessionId: session.id,
        questionId: question.id,
        body: draft,
        noteId: existingNote?.id ?? null,
      });
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Leaving the route entirely -- a reload, a closed tab, a link elsewhere --
  // is the one exit the guarded handlers cannot intercept.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draftRef.current !== (storedRef.current?.body ?? "")) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // A best-effort write on unmount. It cannot be awaited, so it is a
      // safety net rather than the mechanism -- the guarded handlers are.
      const stored = storedRef.current;
      const sessionId = sessionIdRef.current;
      if (!stored || !sessionId) return;
      if (draftRef.current === stored.body) return;
      if (stored.id === null && draftRef.current.trim() === "") return;
      saveNote.mutate({
        sessionId,
        questionId: stored.questionId,
        body: draftRef.current,
        noteId: stored.id,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const shell = (children: React.ReactNode) => (
    <EmployerAppShell
      employerSlug={ws.workspace!.employerSlug}
      employerName={ws.workspace!.employerName}
      role={ws.workspace!.role}
      status={ws.workspace!.employerStatus}
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
      wide
    >
      {children}
    </EmployerAppShell>
  );

  if (q.isLoading) return shell(<State kind="loading" />);
  if (q.isError) {
    const nf = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={nf ? "denied" : "error"}
        message={nf ? undefined : interviewErrorMessage(q.error, t)}
      />,
    );
  }
  if (!d) return shell(<State kind="loading" />);

  if (!session) {
    return shell(
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {d.candidateDisplayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
        <div className="mt-5 max-w-3xl">
          <State kind="empty">{t("iiu.iv.nosession")}</State>
        </div>
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/prepare"
          params={{ employerSlug, caseId }}
          className={`${BUTTON} mt-4`}
        >
          {t("iiu.iv.toprep")}
        </Link>
      </>,
    );
  }

  const qState = (id: string) =>
    pendingState[id] ?? session.questions.find((s) => s.questionId === id)?.state ?? "not_started";
  const isCovered = (id: string) => ["answered", "skipped"].includes(qState(id));
  const stagePractices = d.methodPractices.filter((p) => p.peaceStage === session.peaceStage);

  const requirementOf = (qq: (typeof d.questions)[number]) =>
    d.competencies.find((c) => c.code === qq.competencyCodes[0]) ?? null;
  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;
  const reqMeaning = (c: { definitionSv: string | null; definitionEn: string | null }) =>
    (lang === "en" ? c.definitionEn : c.definitionSv) ?? c.definitionSv;

  const toCover = d.questions.filter((qq) => !isCovered(qq.id));
  const followUps = question
    ? [
        ...question.probes.filter((p) => !CLARIFY_PURPOSES.includes(p.purpose)),
        ...d.generalProbes.filter((p) => !CLARIFY_PURPOSES.includes(p.purpose)),
      ]
    : [];
  const clarifiers = [
    ...(question?.probes ?? []).filter((p) => CLARIFY_PURPOSES.includes(p.purpose)),
    ...d.generalProbes.filter((p) => CLARIFY_PURPOSES.includes(p.purpose)),
  ];

  /* ------------------------------------------------------------------ */
  /* Left · the questions                                                */
  /* ------------------------------------------------------------------ */
  const navigator = (
    <nav aria-label={t("iiu.lv.nav")}>
      <Eyebrow>{t("iiu.lv.nav")}</Eyebrow>
      <ol className="mt-2 space-y-1">
        {d.questions.map((qq, i) => {
          const isCurrent = i === active;
          const covered = isCovered(qq.id);
          return (
            <li key={qq.id}>
              <button
                type="button"
                aria-current={isCurrent ? "true" : undefined}
                onClick={() =>
                  void guarded(() => {
                    setActive(i);
                    setNavOpen(false);
                  })
                }
                className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isCurrent
                    ? "border-accent bg-accent/5"
                    : "border-transparent hover:border-border hover:bg-muted/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums ${
                    isCurrent
                      ? "border-accent bg-accent text-accent-foreground"
                      : covered
                        ? "border-teal-700/40 bg-teal-700/10 text-teal-800 dark:text-teal-200"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {covered && !isCurrent ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs leading-snug ${
                      isCurrent ? "font-semibold text-foreground" : "text-foreground"
                    }`}
                  >
                    {qq.code} · {qq.promptSv}
                  </span>
                  {/* Workflow state as WORDS, from the same source as the
                      chip beside the question -- the list said "in progress"
                      for the selected question while the question itself said
                      "answered", because being SELECTED is not a state. Which
                      one is selected is carried by the accent and by
                      aria-current, where it belongs. */}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {uiLabel(STATE_LABEL, qState(qq.id), t)}
                    {pendingState[qq.id] !== undefined && ` · ${t("iiu.iv.qstate.pending")}`}
                    {isCurrent && <span className="sr-only"> ({t("iiu.lv.state.current")})</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId }}
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      {/* Compact candidate context. It stays compact deliberately: the person
          is in the room, and the screen's job is the question, not the file. */}
      <header className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {/* The person, then the case. Every one of these screens led with
            the case title -- internal bookkeeping -- and put the candidate
            underneath it in muted grey. */}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {d.candidateDisplayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          <Chip
            tone={session.status === "paused" ? "attention" : "work"}
            srPrefix={t("iiu.iv.sess.srprefix")}
          >
            {session.status === "paused"
              ? t("iiu.iv.sess.paused")
              : session.status === "completed"
                ? t("iiu.iv.sess.completed")
                : t("iiu.iv.sess.inprogress")}
          </Chip>
          <Chip tone="work" srPrefix={t("iiu.iv.peacestep")}>
            {uiLabel(PEACE_LABEL, session.peaceStage, t)}
          </Chip>
        </div>
      </header>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="interview"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      {session.status === "paused" && (
        <div className="mt-5 max-w-3xl">
          <Panel tone="attention" role="status" title={t("iiu.iv.paused.title")}>
            <p>{t("iiu.iv.paused.body")}</p>
            <button
              type="button"
              className={`${BUTTON} mt-2`}
              onClick={() => setSState.mutate({ sessionId: session.id, status: "in_progress" })}
            >
              {t("iiu.iv.resume")}
            </button>
          </Panel>
        </div>
      )}

      {qStateError && (
        <div className="mt-5 max-w-3xl">
          <Panel tone="governance" role="alert" title={t("iiu.iv.qstate.failed")}>
            <p>
              <button
                type="button"
                className={BUTTON}
                disabled={setQState.isPending}
                onClick={() => setQState.mutate(qStateError)}
              >
                {t("iiu.iv.qstate.retry")}
              </button>
            </p>
          </Panel>
        </div>
      )}

      {/* The workspace. Navigator, conversation, support. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[14rem_minmax(0,1fr)_21rem] xl:gap-7">
        {/* ---- left: the questions, as a column at xl and a drawer below ---- */}
        <div className="hidden min-w-0 xl:block">
          <div className="xl:sticky xl:top-6">{navigator}</div>
        </div>

        <div className="min-w-0">
          {/* At tablet and phone the list is behind one control rather than
              squeezed into a third column nobody can read. */}
          <div className="mb-4 xl:hidden">
            <button
              type="button"
              className={BUTTON}
              aria-expanded={navOpen}
              aria-controls="q-drawer"
              onClick={() => setNavOpen((v) => !v)}
            >
              {t("iiu.lv.nav.open")} ({active + 1}/{d.questions.length})
            </button>
            {navOpen && (
              <div id="q-drawer" className="mt-3 rounded-lg border border-border bg-card p-3">
                {navigator}
              </div>
            )}
          </div>

          {question && (
            <>
              {/* Where the interviewer is in the fixed set. A count, never a
                  percentage or a score: this measures the conversation's
                  progress through eight governed questions, not the candidate. */}
              <p
                className="text-sm font-medium tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {t("iiu.lv.progress")} {active + 1} {t("iiu.lv.progress.of")} {d.questions.length}
              </p>

              {/* Q1-Q8 are governed content locked to the package version and
                  must never be rewritten — including by translation. An
                  English-reading interviewer needs to know that is deliberate. */}
              {lang === "en" && (
                <p className="mt-1 max-w-[68ch] text-xs text-muted-foreground">
                  {t("iiu.iv.packlocale")}
                </p>
              )}

              {/* The question itself. The single most important thing on the
                  screen, and sized like it. */}
              <h2 className="mt-2 max-w-[46ch] text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                {question.promptSv}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Chip tone="work">{question.code}</Chip>
                <Chip>
                  {question.questionType === "behavioural"
                    ? t("iiu.iv.type.behavioural")
                    : t("iiu.iv.type.situational")}
                </Chip>
                <Chip
                  tone={isCovered(question.id) ? "confirmed" : "neutral"}
                  srPrefix={t("iiu.iv.questionstatus")}
                >
                  {uiLabel(STATE_LABEL, qState(question.id), t)}
                </Chip>
                <span className="text-xs text-muted-foreground">{t("iiu.iv.verbatim")}</span>
              </div>

              {/* Why this matters, in role terms. Not methodology prose. */}
              {(() => {
                const req = requirementOf(question);
                if (!req) return null;
                return (
                  <div className="mt-4 border-l-2 border-accent/40 pl-3.5">
                    <Eyebrow>{t("iiu.lv.why")}</Eyebrow>
                    <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-foreground">
                      <span className="font-medium">{reqName(req)}</span>
                      {reqMeaning(req) ? ` — ${reqMeaning(req)}` : ""}
                    </p>
                  </div>
                );
              })()}

              {/* ---- Notes. A SOURCE, and labelled as one. ---- */}
              <div className="mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor="note" className="text-sm font-semibold text-foreground">
                    {t("iiu.lv.notes")}
                  </label>
                  {/* Owner UAT: the interviewer could not tell whether what they
                      had typed was actually stored. The three states are
                      distinct on purpose -- "saving", "not saved yet" and
                      "saved at HH:MM" mean different things to somebody about
                      to press Next. Quiet, and never absent. */}
                  <p
                    role="status"
                    aria-live="polite"
                    className={`text-xs font-medium tabular-nums ${
                      noteError ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {saveNote.isPending
                      ? t("iiu.lv.saving")
                      : noteError
                        ? t("iiu.lv.unsaved")
                        : noteDirty
                          ? t("iiu.iv.note.unsaved")
                          : savedAt
                            ? `${t("iiu.lv.saved")} · ${savedAt}`
                            : " "}
                  </p>
                </div>
                <p id="note-hint" className="mt-1 max-w-[70ch] text-xs text-muted-foreground">
                  {t("iiu.lv.notes.hint")}
                </p>

                {noteError && (
                  <div className="mt-2">
                    <Panel tone="governance" role="alert" title={t("iiu.iv.note.savefailed")}>
                      {blockedNotice && <p>{t("iiu.iv.note.blocked")}</p>}
                      <p className="mt-2">
                        <button
                          type="button"
                          className={BUTTON}
                          disabled={saveNote.isPending}
                          onClick={() => void flushNote()}
                        >
                          {saveNote.isPending
                            ? t("iiu.iv.note.savingbefore")
                            : t("iiu.iv.note.retry")}
                        </button>
                      </p>
                    </Panel>
                  </div>
                )}

                {/* Sized for forty-five minutes of conversation, not for a
                    form field. */}
                <textarea
                  id="note"
                  rows={16}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-describedby="note-hint"
                  className={`${FIELD} min-h-[22rem] resize-y leading-relaxed`}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  onClick={() =>
                    setQState.mutate({
                      sessionId: session.id,
                      questionId: question.id,
                      state: "answered",
                    })
                  }
                >
                  {t("iiu.lv.mark")}
                </button>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() =>
                    setQState.mutate({
                      sessionId: session.id,
                      questionId: question.id,
                      state: "incomplete",
                    })
                  }
                >
                  {t("iiu.iv.state.incomplete")}
                </button>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() =>
                    setQState.mutate({
                      sessionId: session.id,
                      questionId: question.id,
                      state: "revisit",
                    })
                  }
                >
                  {t("iiu.iv.state.revisit")}
                </button>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={active === 0}
                    onClick={() => void guarded(() => setActive((i) => Math.max(0, i - 1)))}
                  >
                    {t("iiu.iv.previous")}
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={active >= d.questions.length - 1}
                    onClick={() =>
                      void guarded(() => setActive((i) => Math.min(d.questions.length - 1, i + 1)))
                    }
                  >
                    {t("iiu.iv.next")}
                  </button>
                </span>
              </div>

              {/* ---- Secondary reading, all of it one click away ---- */}
              <div className="mt-6 space-y-3">
                <Disclosure summary={t("iiu.lv.howto")}>
                  <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                    <li>{t("iiu.iv.howto.1")}</li>
                    <li>{t("iiu.iv.howto.2")}</li>
                    <li>{t("iiu.iv.howto.3")}</li>
                    <li>{t("iiu.iv.howto.4")}</li>
                    <li>{t("iiu.iv.howto.5")}</li>
                    <li>{t("iiu.iv.howto.6")}</li>
                    <li className="font-medium text-foreground">{t("iiu.iv.howto.7")}</li>
                  </ol>
                </Disclosure>

                {/* Anchors shown as behaviour to listen for -- never as a
                    control. There is no rating on this screen. */}
                <Disclosure summary={t("iiu.lv.anchors")}>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.iv.anchors.note")}
                  </p>
                  <dl className="mt-3 space-y-2.5">
                    {[...question.anchors]
                      .sort((a, b) => a.level - b.level)
                      .map((a) => (
                        <div
                          key={a.id}
                          className={
                            a.level === 0
                              ? "rounded-md border border-amber-600/40 bg-amber-500/5 p-3"
                              : "rounded-md border border-border p-3"
                          }
                        >
                          <dt className="text-sm font-semibold text-foreground">
                            {a.level} — {(lang === "en" ? a.labelEn : a.labelSv) ?? a.labelSv}
                          </dt>
                          <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {(lang === "en" ? a.anchorEn : a.anchorSv) ?? a.anchorSv}
                          </dd>
                          {a.level === 0 && (
                            <dd className="mt-1.5">
                              <LevelZeroNote />
                            </dd>
                          )}
                        </div>
                      ))}
                  </dl>
                </Disclosure>

                {d.prohibitedAreas.length > 0 && (
                  <Disclosure summary={t("iiu.iv.prohibited")}>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-foreground">
                      {d.prohibitedAreas.map((a) => (
                        <li key={a.id}>
                          {(lang === "en" ? a.statementEn : a.statementSv) ?? a.statementSv}
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}

                {/* The PEACE stage control. It is a stage of the METHOD, so it
                    sits with the method rather than above the conversation. */}
                <Disclosure summary={t("iiu.iv.peacestep")}>
                  <p className="text-xs text-muted-foreground">{t("iiu.iv.peace.note")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      ["planning", "engage_explain", "account", "closure", "evaluation"] as const
                    ).map((stage) => (
                      <button
                        key={stage}
                        type="button"
                        aria-current={session.peaceStage === stage ? "step" : undefined}
                        className={`${BUTTON} ${session.peaceStage === stage ? "border-accent font-semibold" : ""}`}
                        onClick={() =>
                          setSState.mutate({ sessionId: session.id, peaceStage: stage })
                        }
                      >
                        {uiLabel(PEACE_LABEL, stage, t)}
                      </button>
                    ))}
                  </div>
                  {stagePractices.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {stagePractices.map((p) => (
                        <li key={p.id} className="rounded-md border border-border p-2.5 text-sm">
                          <span className="text-foreground">
                            {(lang === "en" ? p.statementEn : p.statementSv) ?? p.statementSv}
                          </span>
                          {/*
                            scp_interview_method_practices.rationale is NOT
                            rendered. It is the internal, English-language
                            justification for why a practice is in the method
                            library -- written for whoever reviews the library,
                            not for a recruiter mid-interview. It was reaching
                            this screen verbatim, so a Swedish interview page
                            carried lines like "Process fidelity is measurable
                            and is about the interviewer." Half-translated is
                            worse than absent, and the provenance line below
                            already tells the recruiter what backs the practice.
                          */}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {p.hasResearchClaim
                              ? t("iiu.iv.practice.claim")
                              : t("iiu.iv.practice.craft")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Disclosure>
              </div>
            </>
          )}
        </div>

        {/* ---- right: interview support ----
            Live support during the interview, and deliberately NOT a model.
            TRUST permits zero AI tasks in Understand, so nothing on this panel
            is generated: it is the approved pack content and the method,
            arranged into four bounded categories so the interviewer can use it
            without looking away from the candidate. The panel says so in its
            own words, because a surface called "copilot" that stayed silent
            about it would be read as one that is listening.

            There is no chat here, no transcript, no recording control and no
            confidence figure, because none of those exist in this product. */}
        <aside className="min-w-0" aria-labelledby="s-copilot">
          <div className="rounded-lg border border-border bg-card p-4 xl:sticky xl:top-6">
            <h2 id="s-copilot" className="text-sm font-semibold text-foreground">
              {t("iiu.iv.copilot.title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("iiu.iv.copilot.noai")}
            </p>

            <div className="mt-4 space-y-4">
              {/* 1 · what is left */}
              <SupportGroup title={t("iiu.lv.cat.tocover")}>
                {toCover.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("iiu.lv.cat.tocover.none")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1">
                    {toCover.map((qq) => (
                      <li key={qq.id}>
                        <Chip tone={qq.id === question?.id ? "work" : "neutral"}>{qq.code}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </SupportGroup>

              {/* 2 · the pack's own follow-ups for this question */}
              <SupportGroup title={t("iiu.lv.cat.followup")}>
                {followUps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("iiu.lv.cat.followup.none")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {followUps.map((p) => (
                      <li key={p.id} className="text-xs leading-relaxed text-foreground">
                        {p.wordingSv}
                      </li>
                    ))}
                  </ul>
                )}
              </SupportGroup>

              {/* 3 · checking you understood, not challenging the person */}
              {clarifiers.length > 0 && (
                <SupportGroup title={t("iiu.lv.cat.clarify")}>
                  <ul className="space-y-1.5">
                    {clarifiers.map((p) => (
                      <li key={p.id} className="text-xs leading-relaxed text-foreground">
                        {p.wordingSv}
                      </li>
                    ))}
                  </ul>
                </SupportGroup>
              )}

              {/* 4 · what a conversation cannot settle */}
              {d.verificationRules.length > 0 && (
                <SupportGroup title={t("iiu.lv.cat.verify")}>
                  <ul className="space-y-2">
                    {d.verificationRules.map((v) => (
                      <li key={v.id} className="text-xs leading-relaxed">
                        <span className="font-medium text-foreground">{v.requirementSv}</span>
                        {v.interviewActionSv && (
                          <span className="block text-muted-foreground">{v.interviewActionSv}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {t("iiu.lv.cat.verify.note")}
                  </p>
                </SupportGroup>
              )}

              {/* The 5E shape of a complete account. A description of what to
                  listen for, never a count of what was heard. */}
              <SupportGroup title={t("iiu.iv.copilot.listen")}>
                <ol className="space-y-1 text-xs text-foreground">
                  <li>1. {t("iiu.ev.5e.1")}</li>
                  <li>2. {t("iiu.ev.5e.2")}</li>
                  <li>3. {t("iiu.ev.5e.3")}</li>
                  <li>4. {t("iiu.ev.5e.4")}</li>
                  <li>5. {t("iiu.ev.5e.5")}</li>
                </ol>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.iv.copilot.5enote")}
                </p>
              </SupportGroup>
            </div>

            {/* The governed conduct rows: a sequence and a set of prohibited
                TECHNIQUES, which is a different list from the prohibited
                SUBJECTS above. Both are needed -- a permitted subject asked
                with an interrogation technique is still the thing this product
                must not do. Collapsed, because a recruiter mid-question needs
                the follow-ups first. */}
            <details className="group mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {t("iiu.cd.sequence")}
              </summary>
              <GovernedGuidance
                title={t("iiu.cd.sequence")}
                rows={d.conductSteps.map((c) => ({
                  id: c.id,
                  surface: "conduct_step",
                  statementSv: `${c.labelSv}: ${c.guidanceSv}`,
                  statementEn: `${c.labelEn}: ${c.guidanceEn}`,
                }))}
                ordered
                level={3}
                note={t("iiu.cd.sequence.note")}
              />
              <GovernedGuidance
                title={t("iiu.cd.never")}
                rows={d.conductProhibitions.map((c) => ({
                  id: c.id,
                  surface: "conduct_prohibition",
                  statementSv: c.statementSv,
                  statementEn: c.statementEn,
                }))}
                level={3}
                note={t("iiu.cd.never.note")}
              />
            </details>

            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              {t("iiu.iv.copilot.notes")}
            </p>
          </div>
        </aside>
      </div>

      {/* ---- Closing the conversation ---- */}
      <section aria-labelledby="s-session" className="mt-9 max-w-3xl border-t border-border pt-6">
        <h2 id="s-session" className="text-base font-semibold text-foreground">
          {t("iiu.lv.session")}
        </h2>
        {session.status !== "completed" ? (
          <>
            <label htmlFor="reflect" className="mt-3 block text-sm font-medium text-foreground">
              {t("iiu.iv.reflection.title")}
            </label>
            <p id="reflect-hint" className="mt-0.5 max-w-[70ch] text-xs text-muted-foreground">
              {t("iiu.iv.reflection.note")}
            </p>
            <textarea
              id="reflect"
              rows={3}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              aria-describedby="reflect-hint"
              className={`${FIELD} max-w-3xl`}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON}
                onClick={() =>
                  void guarded(() => setSState.mutate({ sessionId: session.id, status: "paused" }))
                }
              >
                {t("iiu.iv.pause")}
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() =>
                  void guarded(() =>
                    setSState.mutate({
                      sessionId: session.id,
                      status: "completed",
                      peaceStage: "evaluation",
                      processReflection: reflection || undefined,
                    }),
                  )
                }
              >
                {t("iiu.iv.finish")}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3 max-w-3xl">
            <Panel tone="confirmed" title={t("iiu.iv.completed.title")}>
              <p>{t(d.aiAvailable ? "iiu.iv.completed.body" : "iiu.iv.completed.body.manual")}</p>
            </Panel>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
              params={{ employerSlug, caseId }}
              className={`${PRIMARY_BUTTON} mt-3`}
            >
              {t("iiu.iv.toevidence")}
            </Link>
          </div>
        )}
      </section>
    </>,
  );
}

/** One bounded category on the support column. Bounded is the point: four
 *  named kinds of help, not an open field a model could fill. */
function SupportGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
