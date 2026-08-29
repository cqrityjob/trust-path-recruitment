// The guided Interview Workspace.
//
// Three properties matter more than anything else on this screen:
//
//   Q1-Q8 ARE THE PACK'S. The wording is rendered verbatim from the pinned
//   version and there is no code path here that edits it. AI does not appear in
//   this screen at all — the interview works with the provider switched off.
//
//   NOTES ARE NOT EVIDENCE. What the interviewer types is a source. Evidence is
//   what a human later confirms, on a different screen, into a different table.
//
//   NO VERDICT DURING THE INTERVIEW. There is no rating control here. Anchors
//   are shown as descriptions of behaviour to listen for, and the assessment
//   happens after the account is complete.

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
  CaseSteps,
  Chip,
  LevelZeroNote,
  NextStep,
  Panel,
  PEACE_LABEL,
  State,
  TrustStageBanner,
  interviewErrorMessage,
  PRACTICE_KIND_LABEL,
  uiLabel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  getInterviewCase,
  getTrustStage,
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

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);

  const trustFn = useServerFn(getTrustStage);
  const noteFn = useServerFn(saveInterviewNote);
  const qStateFn = useServerFn(setQuestionState);
  const sStateFn = useServerFn(setSessionState);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  // Which CQrity TRUST stage this case is in. Derived in the database from
  // the case status and the session's PEACE stage, so it cannot disagree
  // with the workflow the rest of the screen shows.
  const trustQ = useQuery({
    queryKey: ["ii", "trust-stage", caseId],
    queryFn: () => trustFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });

  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
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
  // Optimistic question state. The chip used to wait for a refetch, so
  // "Markera besvarad" looked like it had done nothing for a beat -- exactly
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
    // told confidently: the chip would keep saying "Besvarad" after the write
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
        <h1 className="text-2xl font-semibold text-foreground">{d.title}</h1>
        <div className="mt-4 max-w-3xl">
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
  const stagePractices = d.methodPractices.filter((p) => p.peaceStage === session.peaceStage);

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="text-accent underline-offset-2 hover:underline"
        >
          Interview Intelligence
        </Link>
      </nav>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.candidateDisplayName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          {savedAt && (
            <Chip tone="confirmed">
              {t("iiu.iv.saved")} {savedAt}
            </Chip>
          )}
        </div>
      </header>

      <div className="mt-6 max-w-4xl">
        <TrustStageBanner stage={trustQ.data ?? null} aiAvailable={d.aiAvailable} />
      </div>

      <div className="mt-6">
        <CaseSteps current={d.status} />
        <NextStep status={d.status} />
      </div>

      {session.status === "paused" && (
        <div className="mt-6 max-w-3xl">
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

      {/* Owner UAT: the interview page worked but did not tell the
          interviewer how to actually run it. Seven lines, collapsed by
          default so it does not sit between them and the candidate. */}
      <details className="mt-6 max-w-3xl rounded-lg border border-border p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          {t("iiu.iv.howto.title")}
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>{t("iiu.iv.howto.1")}</li>
          <li>{t("iiu.iv.howto.2")}</li>
          <li>{t("iiu.iv.howto.3")}</li>
          <li>{t("iiu.iv.howto.4")}</li>
          <li>{t("iiu.iv.howto.5")}</li>
          <li>{t("iiu.iv.howto.6")}</li>
          <li className="font-medium text-foreground">{t("iiu.iv.howto.7")}</li>
        </ol>
      </details>

      {/* PEACE stage control */}
      <section className="mt-6" aria-labelledby="s-peace">
        <h2 id="s-peace" className="text-sm font-semibold text-foreground">
          {t("iiu.iv.peacestep")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("iiu.iv.peace.note")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["planning", "engage_explain", "account", "closure", "evaluation"] as const).map(
            (stage) => (
              <button
                key={stage}
                type="button"
                aria-current={session.peaceStage === stage ? "step" : undefined}
                className={`${BUTTON} ${session.peaceStage === stage ? "border-accent font-semibold" : ""}`}
                onClick={() => setSState.mutate({ sessionId: session.id, peaceStage: stage })}
              >
                {uiLabel(PEACE_LABEL, stage, t)}
              </button>
            ),
          )}
        </div>
        {stagePractices.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {stagePractices.map((p) => (
              <li key={p.id} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Chip tone={p.practiceKind === "warning" ? "attention" : "work"}>
                    {uiLabel(PRACTICE_KIND_LABEL, p.practiceKind, t)}
                  </Chip>
                  <span className="text-foreground">
                    {(lang === "en" ? p.statementEn : p.statementSv) ?? p.statementSv}
                  </span>
                </div>
                {/*
                  scp_interview_method_practices.rationale is NOT rendered.
                  It is the internal, English-language justification for why a
                  practice is in the method library — written for whoever
                  reviews the library, not for a recruiter mid-interview. It was
                  reaching this screen verbatim, so a Swedish interview page
                  carried lines like "Process fidelity is measurable and is
                  about the interviewer." Half-translated is worse than absent,
                  and the provenance line below already tells the recruiter what
                  backs the practice. If this rationale is ever meant for
                  customers it needs authoring in Swedish as customer copy,
                  which is content work rather than a rendering fix.
                */}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {p.hasResearchClaim ? t("iiu.iv.practice.claim") : t("iiu.iv.practice.craft")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Question navigation — buttons, never drag-and-drop, order is fixed */}
      <section className="mt-8" aria-labelledby="s-questions">
        <h2 id="s-questions" className="text-lg font-semibold text-foreground">
          {t("iiu.iv.questions")}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({d.questions.length} {t("iiu.iv.fixedorder")})
          </span>
        </h2>
        <nav aria-label={t("iiu.iv.questions")} className="mt-3 flex flex-wrap gap-2">
          {d.questions.map((qq, i) => {
            const st = qState(qq.id);
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => void guarded(() => setActive(i))}
                aria-current={i === active ? "true" : undefined}
                className={`${BUTTON} ${i === active ? "border-accent font-semibold" : ""}`}
              >
                {qq.code}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {uiLabel(STATE_LABEL, st, t)}
                  {pendingState[qq.id] !== undefined && ` · ${t("iiu.iv.qstate.pending")}`}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {qStateError && (
        <div className="mt-3 max-w-3xl">
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

      {question && (
        <section className="mt-6 max-w-6xl" aria-labelledby="s-current">
          <h3 id="s-current" className="sr-only">
            {t("iiu.iv.current")}
          </h3>

          {/* Where the interviewer is in the fixed set. A count, never a
              percentage or a score: this measures the conversation's progress
              through eight governed questions, not the candidate. */}
          {/* Q1-Q8 are governed content locked to the package version and must
              never be rewritten — including by translation. An English-reading
              interviewer needs to know that is deliberate, not a gap. */}
          {lang === "en" && (
            <p className="mb-2 max-w-[68ch] text-xs text-muted-foreground">
              {t("iiu.iv.packlocale")}
            </p>
          )}

          <p className="mb-2 text-sm font-medium text-muted-foreground" aria-live="polite">
            {t("iiu.iv.progress.question")} {active + 1} {t("iiu.iv.progress.of")}{" "}
            {d.questions.length}
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="work">{question.code}</Chip>
                <Chip>
                  {question.questionType === "behavioural"
                    ? t("iiu.iv.type.behavioural")
                    : t("iiu.iv.type.situational")}
                </Chip>
                <Chip
                  tone={qState(question.id) === "answered" ? "confirmed" : "neutral"}
                  srPrefix={t("iiu.iv.questionstatus")}
                >
                  {uiLabel(STATE_LABEL, qState(question.id), t)}
                </Chip>
              </div>

              <blockquote className="mt-3 border-l-2 border-accent pl-3 text-base leading-relaxed text-foreground">
                {question.promptSv}
              </blockquote>
              <p className="mt-1 text-xs text-muted-foreground">{t("iiu.iv.verbatim")}</p>

              {question.probes.length > 0 && (
                <>
                  <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("iiu.iv.approvedprobes")}
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {question.probes.map((p) => (
                      <li key={p.id} className="text-sm text-foreground">
                        · {p.wordingSv}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {d.generalProbes.length > 0 && (
                <>
                  <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("iiu.iv.generalprobes")}
                  </h4>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {d.generalProbes.map((p) => (
                      <li key={p.id}>
                        <Chip tone="work">{p.wordingSv}</Chip>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {question.dimensions.length > 0 && (
                <>
                  <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("iiu.iv.evidencetoseek")}
                  </h4>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {question.dimensions.map((dim) => (
                      <li key={dim.id}>
                        <Chip>{(lang === "en" ? dim.labelEn : dim.labelSv) ?? dim.labelSv}</Chip>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Notes. A SOURCE, and labelled as one. */}
              <div className="mt-5">
                <label htmlFor="note" className="text-sm font-medium text-foreground">
                  {t("iiu.iv.notes")}
                </label>
                <p id="note-hint" className="mt-0.5 text-xs text-muted-foreground">
                  {t("iiu.iv.notes.hint")}
                </p>
                {/* Owner UAT: the interviewer could not tell whether what they
                    had typed was actually stored. The timestamp existed but sat
                    far away in the header, so it read as page furniture rather
                    than as an answer to "did that save?". */}
                {/* A pending or failed save is never reported as saved. The
                    three states are distinct on purpose: "saving", "not saved
                    yet" and "saved at HH:MM" mean different things to somebody
                    about to press Next. */}
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1 text-xs font-medium ${
                    noteError ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {saveNote.isPending
                    ? t("iiu.iv.saving")
                    : noteError
                      ? t("iiu.iv.note.unsaved")
                      : noteDirty
                        ? t("iiu.iv.note.unsaved")
                        : savedAt
                          ? `${t("iiu.iv.saved.notes")} · ${savedAt}`
                          : "\u00a0"}
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
                <textarea
                  id="note"
                  rows={8}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-describedby="note-hint"
                  className={FIELD}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() =>
                    setQState.mutate({
                      sessionId: session.id,
                      questionId: question.id,
                      state: "answered",
                    })
                  }
                >
                  {t("iiu.iv.markanswered")}
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
              </div>
            </div>

            {/* ---- CQrity Copilot ----
                Live support during the interview, and deliberately NOT a model.
                TRUST permits zero AI tasks in Understand, so nothing on this
                panel is generated: it is the approved pack content and the
                method, arranged so the interviewer can use it without looking
                away from the candidate. The panel says so in its own words,
                because a surface called "copilot" that stayed silent about it
                would be read as one that is listening. */}
            <aside className="lg:sticky lg:top-4 lg:self-start" aria-labelledby="s-copilot">
              <div className="rounded-lg border border-border p-4">
                <h4 id="s-copilot" className="text-sm font-semibold text-foreground">
                  {t("iiu.iv.copilot.title")}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("iiu.iv.copilot.noai")}
                </p>

                <h5 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("iiu.iv.copilot.listen")}
                </h5>
                <ol className="mt-2 space-y-1 text-xs text-foreground">
                  <li>1. {t("iiu.ev.5e.1")}</li>
                  <li>2. {t("iiu.ev.5e.2")}</li>
                  <li>3. {t("iiu.ev.5e.3")}</li>
                  <li>4. {t("iiu.ev.5e.4")}</li>
                  <li>5. {t("iiu.ev.5e.5")}</li>
                </ol>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.iv.copilot.5enote")}
                </p>

                {d.prohibitedAreas.length > 0 && (
                  <>
                    <h5 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("iiu.iv.copilot.donot")}
                    </h5>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {d.prohibitedAreas.slice(0, 4).map((a) => (
                        <li key={a.id}>
                          · {(lang === "en" ? a.statementEn : a.statementSv) ?? a.statementSv}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.iv.copilot.notes")}
                </p>
              </div>
            </aside>
          </div>

          {/* Anchors shown as behaviour to listen for — never as a control */}
          <div className="mt-4 rounded-lg border border-border p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("iiu.iv.anchors.title")}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">{t("iiu.iv.anchors.note")}</p>
            <div className="mt-3 space-y-2">
              {question.anchors
                .filter((a) => a.level === 0)
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-amber-600/40 bg-amber-500/5 p-3"
                  >
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      0 — {a.labelSv}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {a.anchorSv}
                    </p>
                    <div className="mt-1.5">
                      <LevelZeroNote />
                    </div>
                  </div>
                ))}
              {question.anchors
                .filter((a) => a.level > 0)
                .sort((a, b) => a.level - b.level)
                .map((a) => (
                  <div key={a.id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {a.level} — {a.labelSv}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {a.anchorSv}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Prohibited areas — always visible during the interview */}
      {d.prohibitedAreas.length > 0 && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-prohibited">
          <h2 id="s-prohibited" className="text-lg font-semibold text-foreground">
            {t("iiu.iv.prohibited")}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {d.prohibitedAreas.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border p-2.5 text-sm text-foreground"
              >
                {(lang === "en" ? a.statementEn : a.statementSv) ?? a.statementSv}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Session controls */}
      <section className="mt-10 max-w-3xl" aria-labelledby="s-session">
        <h2 id="s-session" className="text-lg font-semibold text-foreground">
          {t("iiu.iv.session")}
        </h2>
        {session.status !== "completed" ? (
          <>
            <label htmlFor="reflect" className="mt-3 block text-sm font-medium text-foreground">
              {t("iiu.iv.reflection.title")}
            </label>
            <p id="reflect-hint" className="mt-0.5 text-xs text-muted-foreground">
              {t("iiu.iv.reflection.note")}
            </p>
            <textarea
              id="reflect"
              rows={3}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              aria-describedby="reflect-hint"
              className={FIELD}
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
          <div className="mt-3">
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
