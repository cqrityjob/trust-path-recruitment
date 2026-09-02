// Review — the information-validation workspace.
//
// One job, and it is not assessment: decide what may legitimately be used.
// The page is built around a single question at a time, because reviewing
// eight questions in one scroll is how a reviewer starts forming a view of the
// candidate while they are still deciding what the material is.
//
// Three zones: the questions on the left, the material for the selected one in
// the middle, the context that makes it reviewable on the right.
//
// Every proposal is shown with the four things that make it checkable — what
// it is, why it is relevant, what is uncertain, and what may NOT be concluded
// from it — beside the note it was read out of. A human confirms, edits or
// rejects it. Editing keeps both texts. Nothing is ever auto-confirmed.

import { createFileRoute, Link } from "@tanstack/react-router";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  WorkflowNav,
  Chip,
  Panel,
  State,
  interviewErrorMessage,
  MaterialBadge,
  MaterialLegend,
  FiveEPanel,
  uiLabel,
  ProviderModeNote,
  WithheldPanel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Disclosure,
  Eyebrow,
  Field,
  Nothing,
  RailPanel,
  Section,
} from "@/components/employer/interview/InterviewLayout";
import {
  getInterviewCase,
  getPanel,
  reviewEvidenceProposal,
  authorEvidence,
  runInterviewAnalysis,
} from "@/lib/interview-intelligence/runtime.functions";
import { singleFlight } from "@/lib/interview-intelligence/single-flight";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/evidence",
)({
  ssr: false,
  component: Page,
  errorComponent: EmployerErrorState,
  // `?q=Q2` is how the assessment screen sends a recruiter here to fetch the
  // material one specific question is missing. Landing them on Q1 and letting
  // them search is the dead end this exists to remove.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const raw = typeof search.q === "string" ? search.q.trim() : "";
    return /^Q\d{1,2}$/.test(raw) ? { q: raw } : {};
  },
});

const CORRECTION_CLASSES = [
  ["ai_model_error", "iiu.ev.reason.ai_model_error"],
  ["ambiguous_source", "iiu.ev.reason.ambiguous_source"],
  ["missing_source", "iiu.ev.reason.missing_source"],
  ["incorrect_mapping", "iiu.ev.reason.incorrect_mapping"],
  ["policy_violation", "iiu.ev.reason.policy_violation"],
  ["user_preference", "iiu.ev.reason.user_preference"],
  ["reviewer_disagreement", "iiu.ev.reason.reviewer_disagreement"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

/** The governed tasks behind the single "analyse" action, in the recruiter's
 *  words rather than as registry identifiers. */
const ANALYSIS_TASK_LABEL: Record<string, TranslationKey> = {
  evidence_extraction: "iiu.ev.task.evidence_extraction",
  evidence_dimension_mapping: "iiu.ev.task.evidence_dimension_mapping",
  gap_and_contradiction_detection: "iiu.ev.task.gap_and_contradiction_detection",
  enter_evidence_review: "iiu.ev.task.enter_evidence_review",
};

const FINDING_LABEL: Record<string, TranslationKey> = {
  gap: "iiu.find.gap",
  unclear: "iiu.find.unclear",
  contradiction: "iiu.find.contradiction",
  verification: "iiu.find.verification",
};

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, tp, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const analyseFn = useServerFn(runInterviewAnalysis);
  const authorFn = useServerFn(authorEvidence);
  const reviewFn = useServerFn(reviewEvidenceProposal);
  const panelFn = useServerFn(getPanel);
  // One intention, one request. A second click in the same frame -- before
  // the button re-renders as disabled -- returns the in-flight promise
  // instead of starting a twin. The database absorbs a twin too; the point
  // here is that the recruiter sees one outcome for one action.
  const authorOnce = useMemo(
    () =>
      singleFlight(
        (v: { caseId: string; questionId: string; excerpt: string; noteId: string | null }) =>
          authorFn({ data: v }),
      ),
    [authorFn],
  );
  const analyseOnce = useMemo(
    () => singleFlight((v: { caseId: string }) => analyseFn({ data: v })),
    [analyseFn],
  );
  const reviewOnce = useMemo(
    () =>
      singleFlight(
        (v: {
          proposalId: string;
          decision: "accept" | "edit" | "reject" | "unresolved";
          editedExcerpt: string | undefined;
          correctionClass: string | undefined;
          note: string | undefined;
        }) => reviewFn({ data: { ...v, correctionClass: v.correctionClass as never } }),
      ),
    [reviewFn],
  );

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });

  // Whether joint review means anything for this case. Two or more assessors
  // is the whole condition; below that there is nothing to compare.
  const panelQ = useQuery({
    queryKey: ["ii", "panel", caseId],
    queryFn: () => panelFn({ data: { caseId } }),
    retry: false,
  });
  const jointReviewRelevant = (panelQ.data?.members.length ?? 0) >= 2;

  const { q: requestedCode } = Route.useSearch();
  const [active, setActive] = useState(0);
  // Follow the deep link once the questions have loaded, and again if the
  // recruiter arrives at a different question from the assessment screen.
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedCode || followed.current === requestedCode) return;
    const i = (q.data?.questions ?? []).findIndex((qq) => qq.code === requestedCode);
    if (i >= 0) {
      followed.current = requestedCode;
      setActive(i);
    }
  }, [requestedCode, q.data]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [correction, setCorrection] = useState<string>("ai_model_error");
  const [note, setNote] = useState("");
  // Writing evidence by hand. With AI off this is the ONLY way evidence
  // reaches the case — the extraction section cannot run — so the journey
  // dead-ended here before this existed.
  const [evExcerpt, setEvExcerpt] = useState("");
  // Which note the excerpt in the box was taken out of, so an edited quote
  // keeps the link back to its source.
  const [evNoteId, setEvNoteId] = useState<string | null>(null);
  const authorEv = useMutation({
    mutationFn: (v: { questionId: string; excerpt: string; noteId: string | null }) =>
      authorOnce({ caseId, questionId: v.questionId, excerpt: v.excerpt, noteId: v.noteId }),
    onSuccess: () => {
      setEvExcerpt("");
      setEvNoteId(null);
      void q.refetch();
    },
  });

  // One recruiter action; several governed runs underneath, each in the TRUST
  // stage that permits it. The result reports per-step outcomes, so a later
  // failure shows as partial completion rather than erasing what worked.
  const analyse = useMutation({
    mutationFn: () => analyseOnce({ caseId }),
    onSuccess: () => void q.refetch(),
  });
  const review = useMutation({
    mutationFn: (v: {
      proposalId: string;
      decision: "accept" | "edit" | "reject" | "unresolved";
    }) =>
      reviewOnce({
        proposalId: v.proposalId,
        decision: v.decision,
        editedExcerpt: v.decision === "edit" ? editText : undefined,
        correctionClass: v.decision === "edit" || v.decision === "reject" ? correction : undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      setEditing(null);
      setEditText("");
      setNote("");
      void refresh();
    },
  });

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
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  const question = d.questions[active] ?? d.questions[0] ?? null;
  // A note with an empty body is a record of nothing, and rendering it as a
  // blue card makes the screen look broken rather than empty.
  const notesFor = (id: string) =>
    (d.session?.notes ?? []).filter((n) => n.questionId === id && n.body.trim() !== "");
  const proposalsFor = (id: string) => d.proposals.filter((p) => p.questionId === id);
  const evidenceFor = (id: string) => d.evidence.filter((e) => e.questionId === id);
  const findingsFor = (id: string) =>
    d.findings.filter((f) => f.questionId === id && f.resolutionState !== "resolved");
  const pendingFor = (id: string) =>
    proposalsFor(id).filter((p) => p.reviewState === "pending").length;

  const reqOf = (qq: (typeof d.questions)[number]) =>
    qq.competencyCodes
      .map((code) => d.competencies.find((c) => c.code === code))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;

  const openVerify = d.findings.filter(
    (f) => f.findingKind === "verification" && f.resolutionState !== "resolved",
  );
  const canWork = ["interview_complete", "evidence_review"].includes(d.status);

  /* ------------------------------------------------------------------ */
  /* Left · the questions, as a work queue                               */
  /* ------------------------------------------------------------------ */
  const navigator = (
    <nav aria-label={t("iiu.rv.questions")}>
      <ol className="space-y-1">
        {d.questions.map((qq, i) => {
          const confirmed = evidenceFor(qq.id).length;
          const pending = pendingFor(qq.id);
          const isCurrent = i === active;
          // Workflow state only. Nothing on this list says anything about how
          // the candidate answered -- a question with three confirmed extracts
          // is not a question that went well.
          const stateLabel =
            pending > 0
              ? t("iiu.rv.pending")
              : confirmed > 0
                ? t("iiu.rv.reviewed")
                : t("iiu.rv.untouched");
          return (
            <li key={qq.id}>
              <button
                type="button"
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => {
                  setActive(i);
                  setEditing(null);
                }}
                className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isCurrent
                    ? "border-accent bg-accent/5"
                    : "border-transparent hover:border-border hover:bg-muted/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-px font-mono text-[11px] font-semibold ${
                    isCurrent ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {qq.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs leading-snug ${
                      isCurrent ? "font-semibold text-foreground" : "text-foreground"
                    }`}
                  >
                    {qq.promptSv}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {confirmed} {tp("iiu.rv.items", confirmed)} · {stateLabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {t("iiu.rv.questions.note")}
      </p>
    </nav>
  );

  /* ------------------------------------------------------------------ */
  /* Right · what makes the material reviewable                          */
  /* ------------------------------------------------------------------ */
  const context = question && (
    <div className="space-y-4">
      <RailPanel id="s-context" title={t("iiu.rv.context")}>
        <dl className="space-y-3">
          <Field label={t("iiu.rv.context.requirement")}>
            {reqOf(question).length === 0 ? (
              "—"
            ) : (
              <ul className="space-y-0.5">
                {reqOf(question).map((c) => (
                  <li key={c.id}>{reqName(c)}</li>
                ))}
              </ul>
            )}
          </Field>
          {/* The code and the type, not the prompt: the prompt is two columns
              to the left in full, and printing it twice on one screen is how a
              context panel turns into padding. */}
          <Field label={t("iiu.rv.context.question")}>
            {question.code} ·{" "}
            {question.questionType === "behavioural"
              ? t("iiu.iv.type.behavioural")
              : t("iiu.iv.type.situational")}
          </Field>
          {question.dimensions.length > 0 && (
            <Field label={t("iiu.rv.context.dimensions")}>
              <ul className="flex flex-wrap gap-1">
                {question.dimensions.map((dim) => (
                  <li
                    key={dim.id}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] leading-snug"
                  >
                    {(lang === "en" ? dim.labelEn : dim.labelSv) ?? dim.labelSv}
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label={t("iiu.rv.context.sources")}>
            {d.sources.length === 0 ? (
              "—"
            ) : (
              <ul className="space-y-0.5">
                {d.sources.map((s) => (
                  <li key={s.id}>{s.label}</li>
                ))}
              </ul>
            )}
          </Field>
        </dl>
      </RailPanel>

      <RailPanel id="s-verify" title={t("iiu.rv.context.verify")}>
        {openVerify.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("iiu.rv.verify.none")}</p>
        ) : (
          <>
            <Eyebrow>{t("iiu.rv.verify.open")}</Eyebrow>
            <ul className="mt-2 space-y-2">
              {openVerify.map((f) => (
                <li key={f.id} className="text-xs leading-relaxed">
                  <MaterialBadge state="verify" />{" "}
                  <span className="text-foreground">{f.statement}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </RailPanel>

      {/* The one AI action, and the manual path. Both are tools for the
          review, not part of reading one question, so they live on the rail. */}
      {canWork && d.aiAvailable && (
        <RailPanel id="s-tools" title={t("iiu.rv.tools")}>
          {
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("iiu.ev.analyse.body")}
              </p>
              <button
                type="button"
                className={`${BUTTON} mt-3`}
                onClick={() => analyse.mutate()}
                disabled={analyse.isPending}
              >
                {analyse.isPending ? t("iiu.ev.analysing") : t("iiu.ev.analyse")}
              </button>

              {analyse.isPending && (
                <div className="mt-3">
                  <State kind="aiRunning" />
                </div>
              )}
              {analyse.isError && (
                <div className="mt-3">
                  <State kind="aiUnavailable" message={interviewErrorMessage(analyse.error, t)} />
                </div>
              )}
              {analyse.data && (
                <div className="mt-3">
                  <Eyebrow>{t("iiu.ev.analyse.steps")}</Eyebrow>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {analyse.data.steps.map((st) => (
                      <li key={st.task} className="flex flex-wrap items-center gap-1.5">
                        <Chip
                          tone={
                            st.status === "succeeded"
                              ? "confirmed"
                              : st.status === "abstained"
                                ? "attention"
                                : "governance"
                          }
                        >
                          {st.status === "succeeded"
                            ? t("iiu.ev.step.ok")
                            : st.status === "abstained"
                              ? t("iiu.ev.step.abstained")
                              : t("iiu.ev.step.failed")}
                        </Chip>
                        <span className="text-foreground">
                          {uiLabel(ANALYSIS_TASK_LABEL, st.task, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {analyse.data.steps.some((st) => st.status !== "succeeded") && (
                    <p className="mt-2 text-xs text-muted-foreground">{t("iiu.ev.partial")}</p>
                  )}
                  {analyse.data.providerMode && (
                    <div className="mt-3 space-y-2">
                      <ProviderModeNote mode={analyse.data.providerMode} />
                    </div>
                  )}
                </div>
              )}
              {analyse.data && analyse.data.withheld.length > 0 && (
                <div className="mt-3">
                  <WithheldPanel withheld={analyse.data.withheld} />
                </div>
              )}
            </>
          }
        </RailPanel>
      )}
    </div>
  );

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId }}
          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      <div className="mt-3">
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
          action={
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
              params={{ employerSlug, caseId }}
              className={PRIMARY_BUTTON}
            >
              {t("iiu.ev.toassess")}
            </Link>
          }
        />
      </div>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="assess"
          step="material"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      <Section
        id="s-review"
        title={t("iiu.rv.title")}
        description={t("iiu.rv.lead")}
        className="mt-7"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[15rem_minmax(0,1fr)_20rem] xl:gap-7">
          {/* The navigator is a real column at xl and a disclosure below it,
              rather than a squeezed third of a tablet screen.

              `min-w-0` on both is load-bearing: the list truncates its prompts,
              truncation means white-space:nowrap, and a nowrap child in an
              auto-sized grid track sets the track's min-content width to the
              whole sentence. Without it the document was 1447px wide at 375. */}
          <div className="hidden min-w-0 xl:block">
            <Eyebrow>{t("iiu.rv.questions")}</Eyebrow>
            <div className="mt-2">{navigator}</div>
          </div>
          <div className="min-w-0 xl:hidden">
            <Disclosure summary={t("iiu.rv.questions")} defaultOpen>
              {navigator}
            </Disclosure>
          </div>

          <div className="min-w-0">
            {question ? (
              <>
                {/* ---- the question being reviewed ---- */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="work">{question.code}</Chip>
                    <Chip>
                      {question.questionType === "behavioural"
                        ? t("iiu.iv.type.behavioural")
                        : t("iiu.iv.type.situational")}
                    </Chip>
                    {pendingFor(question.id) > 0 && (
                      <Chip tone="attention">
                        {pendingFor(question.id)} {t("iiu.ev.pending")}
                      </Chip>
                    )}
                  </div>
                  <p className="mt-2.5 text-base leading-relaxed text-foreground">
                    {question.promptSv}
                  </p>
                </div>

                {/* ---- the material, told apart by shape ---- */}
                <section aria-labelledby="s-material" className="mt-6">
                  <h3 id="s-material" className="text-sm font-semibold text-foreground">
                    {t("iiu.rv.material")}
                  </h3>
                  <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.rv.material.note")}
                  </p>
                  {/* Stated once, where the kinds of material first appear
                      together. The distinction is the product; leaving it to be
                      inferred from styling is how it gets lost. */}
                  <MaterialLegend />

                  <div className="mt-4 space-y-4">
                    {/* 1 · what the recruiter wrote during the conversation */}
                    <article aria-label={t("iiu.ev.notes.title")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <MaterialBadge state="note" />
                        <span className="text-xs text-muted-foreground">
                          {t("iiu.ev.notes.source")}
                        </span>
                      </div>
                      {notesFor(question.id).length === 0 ? (
                        <div className="mt-2">
                          <Nothing>{t("iiu.ev.notes.none")}</Nothing>
                        </div>
                      ) : (
                        <>
                          <ul className="mt-2 space-y-2">
                            {notesFor(question.id).map((n) => (
                              <li
                                key={n.id}
                                className="rounded-lg border border-sky-700/30 bg-sky-700/5 p-3.5"
                              >
                                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                                  {n.body}
                                </p>
                                {/* The material is already written down. Making
                                  the recruiter retype their own note to turn it
                                  into confirmed material is the slowest
                                  possible way to do the one thing this screen
                                  is for.

                                  Confirming is still a deliberate human act,
                                  and the note is not consumed by it: it stays a
                                  note, and what is confirmed becomes a separate
                                  record carrying the note's id as its
                                  provenance. */}
                                {canWork && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      className={BUTTON}
                                      disabled={authorEv.isPending}
                                      onClick={() =>
                                        authorEv.mutate({
                                          questionId: question.id,
                                          excerpt: n.body,
                                          noteId: n.id,
                                        })
                                      }
                                    >
                                      {t("iiu.rv.use.note")}
                                    </button>
                                    <button
                                      type="button"
                                      className={BUTTON}
                                      onClick={() => {
                                        setEvExcerpt(n.body);
                                        setEvNoteId(n.id);
                                        document.getElementById("ev-x")?.focus();
                                      }}
                                    >
                                      {t("iiu.rv.use.edit")}
                                    </button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-muted-foreground">
                            {t("iiu.rv.use.hint")}
                          </p>
                        </>
                      )}
                    </article>

                    {/* 2 · what a model proposed out of it */}
                    {proposalsFor(question.id).length > 0 && (
                      <article aria-label={t("iiu.rv.ai.title")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <MaterialBadge state="ai" />
                          <span className="text-xs text-muted-foreground">
                            {t("iiu.rv.ai.title")}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-3">
                          {proposalsFor(question.id).map((p) => {
                            const reviewed = p.reviewState !== "pending";
                            const src = (d.session?.notes ?? []).find((n) => n.id === p.noteId);
                            return (
                              <li
                                key={p.id}
                                className="rounded-lg border border-violet-700/30 bg-violet-700/5 p-4"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip
                                    tone={
                                      reviewed
                                        ? p.reviewState === "rejected"
                                          ? "governance"
                                          : "confirmed"
                                        : "attention"
                                    }
                                    srPrefix={t("iiu.ev.srprefix.review")}
                                  >
                                    {p.reviewState === "pending"
                                      ? t("iiu.ev.state.awaiting")
                                      : p.reviewState === "confirmed"
                                        ? t("iiu.ev.state.confirmed")
                                        : p.reviewState === "edited"
                                          ? t("iiu.ev.state.edited")
                                          : p.reviewState === "rejected"
                                            ? t("iiu.ev.state.rejected")
                                            : t("iiu.ev.state.unresolved")}
                                  </Chip>
                                  {/* The extraction confidence is NOT shown.
                                      It is a fact about the model's own
                                      reading and is kept as provenance; on
                                      a card about a candidate a percentage
                                      is read as a measure of the person,
                                      whatever the label beside it says. */}
                                </div>

                                {/* The recruiter's own words first, then what the
                                    model made of them. Read in this order the
                                    proposal is checkable; read the other way
                                    round it is an assertion. */}
                                {src && (
                                  <div className="mt-3">
                                    <Eyebrow>{t("iiu.ev.fromnote")}</Eyebrow>
                                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                      {src.body}
                                    </p>
                                  </div>
                                )}

                                <div className="mt-3">
                                  <Eyebrow>{t("iiu.ev.proposed")}</Eyebrow>
                                  <blockquote className="mt-1 border-l-2 border-violet-700/40 pl-3 text-sm leading-relaxed text-foreground">
                                    {p.excerpt}
                                  </blockquote>
                                </div>

                                <FiveEPanel value={p.fiveE} />

                                <div className="mt-3">
                                  <Eyebrow>{t("iiu.rv.ai.why")}</Eyebrow>
                                  <dl className="mt-1 space-y-1 text-xs text-muted-foreground">
                                    <div>
                                      <dt className="inline font-medium">
                                        {t("iiu.ev.whyrelevant")}
                                      </dt>
                                      <dd className="inline">{p.relevanceRationale || "—"}</dd>
                                    </div>
                                    {p.uncertaintyNote && (
                                      <div>
                                        <dt className="inline font-medium">
                                          {t("iiu.ev.uncertainty")}
                                        </dt>
                                        <dd className="inline">{p.uncertaintyNote}</dd>
                                      </div>
                                    )}
                                    {p.prohibitedConclusionNote && (
                                      <div>
                                        <dt className="inline font-medium">
                                          {t("iiu.ev.mustnot")}
                                        </dt>
                                        <dd className="inline">{p.prohibitedConclusionNote}</dd>
                                      </div>
                                    )}
                                    <div className="pt-1 text-[11px]">
                                      {t("iiu.ev.extraction.note")}
                                    </div>
                                  </dl>
                                </div>

                                {!reviewed && (
                                  <div className="mt-4">
                                    {editing === p.id ? (
                                      <div className="rounded-md border border-amber-600/40 bg-amber-500/5 p-3">
                                        <label
                                          htmlFor={`edit-${p.id}`}
                                          className="text-xs font-medium text-foreground"
                                        >
                                          {t("iiu.ev.editedexcerpt")}
                                        </label>
                                        <textarea
                                          id={`edit-${p.id}`}
                                          rows={3}
                                          value={editText}
                                          onChange={(e) => setEditText(e.target.value)}
                                          className={FIELD}
                                        />
                                        <label
                                          htmlFor={`corr-${p.id}`}
                                          className="mt-2 block text-xs font-medium text-foreground"
                                        >
                                          {t("iiu.ev.whychanged")}
                                        </label>
                                        <select
                                          id={`corr-${p.id}`}
                                          value={correction}
                                          onChange={(e) => setCorrection(e.target.value)}
                                          className={FIELD}
                                        >
                                          {CORRECTION_CLASSES.map(([v, key]) => (
                                            <option key={v} value={v}>
                                              {t(key)}
                                            </option>
                                          ))}
                                        </select>
                                        <label
                                          htmlFor={`note-${p.id}`}
                                          className="mt-2 block text-xs font-medium text-foreground"
                                        >
                                          {t("iiu.ev.notelabel")}
                                        </label>
                                        <input
                                          id={`note-${p.id}`}
                                          value={note}
                                          onChange={(e) => setNote(e.target.value)}
                                          className={FIELD}
                                        />
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            className={PRIMARY_BUTTON}
                                            disabled={review.isPending || editText.trim() === ""}
                                            onClick={() =>
                                              review.mutate({ proposalId: p.id, decision: "edit" })
                                            }
                                          >
                                            {t("iiu.rv.edit.save")}
                                          </button>
                                          <button
                                            type="button"
                                            className={BUTTON}
                                            onClick={() => setEditing(null)}
                                          >
                                            {t("iiu.ev.cancel")}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Confirm is primary, edit is secondary,
                                            reject is neither -- it removes
                                            material from the case, so it is
                                            drawn as the destructive choice it
                                            is. Nothing here auto-confirms. */}
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            className={PRIMARY_BUTTON}
                                            disabled={review.isPending}
                                            onClick={() =>
                                              review.mutate({
                                                proposalId: p.id,
                                                decision: "accept",
                                              })
                                            }
                                          >
                                            {t("iiu.ev.confirm")}
                                          </button>
                                          <button
                                            type="button"
                                            className={BUTTON}
                                            onClick={() => {
                                              setEditing(p.id);
                                              setEditText(p.excerpt);
                                            }}
                                          >
                                            {t("iiu.rv.edit")}
                                          </button>
                                          <button
                                            type="button"
                                            className={BUTTON}
                                            disabled={review.isPending}
                                            onClick={() =>
                                              review.mutate({
                                                proposalId: p.id,
                                                decision: "unresolved",
                                              })
                                            }
                                          >
                                            {t("iiu.ev.markunresolved")}
                                          </button>
                                          <button
                                            type="button"
                                            className="inline-flex items-center rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                            disabled={review.isPending}
                                            onClick={() =>
                                              review.mutate({
                                                proposalId: p.id,
                                                decision: "reject",
                                              })
                                            }
                                          >
                                            {t("iiu.rv.reject")}
                                          </button>
                                        </div>
                                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                          {t("iiu.rv.reject.note")}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </article>
                    )}

                    {/* 3 · what a human has stood behind */}
                    {evidenceFor(question.id).length > 0 && (
                      <article aria-label={t("iiu.ev.confirmed.title")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <MaterialBadge state="confirmed" />
                          <span className="text-xs text-muted-foreground">
                            {t("iiu.ev.confirmed.title")}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-2">
                          {evidenceFor(question.id).map((e) => (
                            <li
                              key={e.id}
                              className="rounded-lg border border-teal-700/30 bg-teal-700/5 p-3.5 text-sm"
                            >
                              <p className="leading-relaxed text-foreground">{e.excerpt}</p>
                              <p className="mt-2">
                                <Chip srPrefix={t("iiu.ev.srprefix.origin")}>
                                  {e.origin === "human_authored"
                                    ? t("iiu.ev.origin.human")
                                    : e.origin === "ai_proposed_edited"
                                      ? t("iiu.ev.origin.ai_corrected")
                                      : t("iiu.ev.origin.ai_confirmed")}
                                </Chip>
                              </p>
                              {e.originalExcerpt && (
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                  <span className="font-medium">{t("iiu.ev.aioriginal")}: </span>
                                  {e.originalExcerpt}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </article>
                    )}

                    {/* 4 · what cannot be settled in a conversation */}
                    {findingsFor(question.id).length > 0 && (
                      <article aria-label={t("iiu.as2.openitems")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <MaterialBadge state="verify" />
                          <span className="text-xs text-muted-foreground">
                            {t("iiu.as2.openitems")}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-2">
                          {findingsFor(question.id).map((f) => (
                            <li
                              key={f.id}
                              className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-3.5 text-sm"
                            >
                              <Chip tone="attention">
                                {uiLabel(FINDING_LABEL, f.findingKind, t)}
                              </Chip>{" "}
                              <span className="leading-relaxed text-foreground">{f.statement}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    )}

                    {notesFor(question.id).length === 0 &&
                      proposalsFor(question.id).length === 0 &&
                      evidenceFor(question.id).length === 0 && (
                        <Nothing>{t("iiu.rv.nomaterial")}</Nothing>
                      )}

                    {/* 5 · writing material by hand, for this question */}
                    {canWork && (
                      <form
                        className="rounded-lg border border-border bg-card p-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (evExcerpt.trim() === "") return;
                          authorEv.mutate({
                            questionId: question.id,
                            excerpt: evExcerpt,
                            noteId: evNoteId,
                          });
                        }}
                      >
                        <h4 className="text-sm font-semibold text-foreground">
                          {t("iiu.ev.manual.title")}
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t("iiu.ev.manual.body")}
                        </p>
                        <label
                          htmlFor="ev-x"
                          className="mt-3 block text-xs font-medium text-foreground"
                        >
                          {t("iiu.ev.manual.excerpt")}
                        </label>
                        <textarea
                          id="ev-x"
                          rows={4}
                          value={evExcerpt}
                          onChange={(e) => setEvExcerpt(e.target.value)}
                          className={FIELD}
                          required
                        />
                        {authorEv.isError && (
                          <div className="mt-2">
                            <Panel tone="governance" role="alert" title={t("iiu.ev.manual.failed")}>
                              <p>{interviewErrorMessage(authorEv.error, t)}</p>
                            </Panel>
                          </div>
                        )}
                        <button
                          type="submit"
                          className={`${BUTTON} mt-3`}
                          disabled={authorEv.isPending}
                        >
                          {authorEv.isPending ? t("iiu.pp.saving") : t("iiu.ev.manual.save")}
                        </button>
                      </form>
                    )}
                  </div>

                  {review.isError && (
                    <div className="mt-4">
                      <Panel tone="governance" role="alert" title={t("iiu.ev.reviewfailed")}>
                        <p>{interviewErrorMessage(review.error, t)}</p>
                      </Panel>
                    </div>
                  )}
                </section>

                {/* ---- the handoff ----
                    Review ends here. The assessment workflow is NOT repeated on
                    this page: deciding what the material is and deciding what it
                    means are different jobs, and running them together is what
                    the separation exists to prevent. */}
                <div className="mt-8 rounded-lg border border-border bg-muted/30 p-5">
                  <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                    {t("iiu.rv.handoff")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {/* Straight back to the question the recruiter came here
                        to unblock, not to the top of a page of eight. Shown as
                        the primary route the moment this question HAS material,
                        which is the moment the errand is finished. */}
                    {evidenceFor(question.id).length > 0 && (
                      <Link
                        to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
                        params={{ employerSlug, caseId }}
                        search={{ q: question.code }}
                        className={PRIMARY_BUTTON}
                      >
                        {t("iiu.rv.assessnow")} · {question.code}
                      </Link>
                    )}
                    <Link
                      to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
                      params={{ employerSlug, caseId }}
                      search={requestedCode ? { q: requestedCode } : {}}
                      className={evidenceFor(question.id).length > 0 ? BUTTON : PRIMARY_BUTTON}
                    >
                      {t("iiu.ev.toassess")}
                    </Link>
                    {/* Joint review is a thing two or more assessors do. For a
                        single reviewer it is not a step, and putting it in the
                        journey as one taught the owner to expect a workflow
                        that does not exist for them. */}
                    {jointReviewRelevant && (
                      <Link
                        to="/employer/$employerSlug/interview-intelligence/$caseId/panel"
                        params={{ employerSlug, caseId }}
                        className={BUTTON}
                      >
                        {t("iiu.pl.title")}
                      </Link>
                    )}
                  </div>
                  {!jointReviewRelevant && (
                    <Disclosure summary={t("iiu.pl.title")} className="mt-4">
                      <p className="max-w-[70ch] text-sm leading-relaxed text-foreground">
                        {t("iiu.jr.single.title")}
                      </p>
                      <p className="mt-1.5 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                        {t("iiu.jr.single.body")}
                      </p>
                      <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                        {t("iiu.jr.how")}
                      </p>
                      <p className="mt-1.5 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                        {t("iiu.jr.nomath")}
                      </p>
                    </Disclosure>
                  )}
                </div>
              </>
            ) : (
              <Nothing>{t("iiu.empty")}</Nothing>
            )}
          </div>

          <div className="min-w-0">{context}</div>
        </div>
      </Section>
    </>,
  );
}
