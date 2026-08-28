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
      setSavedAt(new Date().toLocaleTimeString("sv-SE"));
      void refresh();
    },
  });
  const setQState = useMutation({
    mutationFn: (vars: {
      sessionId: string;
      questionId: string;
      state: "answered" | "incomplete" | "revisit" | "in_progress";
    }) =>
      qStateFn({
        data: { sessionId: vars.sessionId, questionId: vars.questionId, state: vars.state },
      }),
    onSuccess: refresh,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  // Autosave. An interview is a live conversation; nobody should have to
  // remember to press save while a person is talking to them.
  useEffect(() => {
    if (!session || !question) return;
    if (draft === (existingNote?.body ?? "")) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (draft.trim() === "") return;
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
    session.questions.find((s) => s.questionId === id)?.state ?? "not_started";
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
                  <span className="text-foreground">{p.statementSv}</span>
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
                onClick={() => setActive(i)}
                aria-current={i === active ? "true" : undefined}
                className={`${BUTTON} ${i === active ? "border-accent font-semibold" : ""}`}
              >
                {qq.code}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {uiLabel(STATE_LABEL, st, t)}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {question && (
        <section className="mt-6 max-w-4xl" aria-labelledby="s-current">
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
                      <Chip>{dim.labelSv}</Chip>
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
                onClick={() => setActive((i) => Math.max(0, i - 1))}
              >
                {t("iiu.iv.previous")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={active >= d.questions.length - 1}
                onClick={() => setActive((i) => Math.min(d.questions.length - 1, i + 1))}
              >
                {t("iiu.iv.next")}
              </button>
            </div>
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
                {a.statementSv}
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
              Intervjuarens egen reflektion (ORBIT)
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
                onClick={() => setSState.mutate({ sessionId: session.id, status: "paused" })}
              >
                Pausa
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() =>
                  setSState.mutate({
                    sessionId: session.id,
                    status: "completed",
                    peaceStage: "evaluation",
                    processReflection: reflection || undefined,
                  })
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
