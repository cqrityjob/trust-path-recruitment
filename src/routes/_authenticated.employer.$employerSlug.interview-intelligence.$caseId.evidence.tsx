// Evidence review, and the human assessment.
//
// This is where the layer-4/layer-5 boundary is actually operated. Every
// proposal is shown with the four things that make it reviewable — what it is,
// why it is relevant, what is uncertain, and what may NOT be concluded from it
// — and a person confirms, edits or rejects it. Editing keeps both texts.
//
// The assessment control appears only after the evidence work, and level 0 is
// drawn apart from 1-4 with its meaning stated, because folding it into the run
// is exactly how it gets read as "a low score".

import { createFileRoute, Link } from "@tanstack/react-router";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
  State,
  TrustStageBanner,
  interviewErrorMessage,
  MaterialBadge,
  MaterialLegend,
  FiveEPanel,
  uiLabel,
  ProviderModeChip,
  ProviderModeNote,
  WithheldPanel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  getInterviewCase,
  getTrustStage,
  markAssessed,
  recordAssessment,
  reviewEvidenceProposal,
  authorEvidence,
  runInterviewAnalysis,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/evidence",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

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

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);

  const trustFn = useServerFn(getTrustStage);
  const analyseFn = useServerFn(runInterviewAnalysis);
  const authorFn = useServerFn(authorEvidence);
  const reviewFn = useServerFn(reviewEvidenceProposal);
  const assessFn = useServerFn(recordAssessment);
  const doneFn = useServerFn(markAssessed);

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

  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [correction, setCorrection] = useState<string>("ai_model_error");
  const [note, setNote] = useState("");
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [assessHint, setAssessHint] = useState<Record<string, "level" | "rationale" | null>>({});
  // Writing evidence by hand. With AI off this is the ONLY way evidence
  // reaches the case — the extraction section cannot run — so the journey
  // dead-ended here before this existed.
  const [evQuestion, setEvQuestion] = useState("");
  const [evExcerpt, setEvExcerpt] = useState("");
  const authorEv = useMutation({
    mutationFn: () => authorFn({ data: { caseId, questionId: evQuestion, excerpt: evExcerpt } }),
    onSuccess: () => {
      setEvExcerpt("");
      void q.refetch();
    },
  });

  // One recruiter action; several governed runs underneath, each in the TRUST
  // stage that permits it. The result reports per-step outcomes, so a later
  // failure shows as partial completion rather than erasing what worked.
  const analyse = useMutation({
    mutationFn: () => analyseFn({ data: { caseId } }),
    onSuccess: () => void q.refetch(),
  });
  const review = useMutation({
    mutationFn: (v: {
      proposalId: string;
      decision: "accept" | "edit" | "reject" | "unresolved";
    }) =>
      reviewFn({
        data: {
          proposalId: v.proposalId,
          decision: v.decision,
          editedExcerpt: v.decision === "edit" ? editText : undefined,
          correctionClass:
            v.decision === "edit" || v.decision === "reject" ? (correction as never) : undefined,
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      setEditing(null);
      setEditText("");
      setNote("");
      void refresh();
    },
  });
  const assess = useMutation({
    mutationFn: (v: { questionId: string; level: number; rationale: string }) =>
      assessFn({
        data: { caseId, questionId: v.questionId, level: v.level, rationale: v.rationale },
      }),
    onSuccess: refresh,
  });
  const finishAssessing = useMutation({
    mutationFn: () => doneFn({ data: { caseId } }),
    onSuccess: refresh,
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

  const pending = d.proposals.filter((p) => p.reviewState === "pending");

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

      <header className="mt-3">
        {/* The person, then the case. Every one of these screens led with
            the case title -- internal bookkeeping -- and put the candidate
            underneath it in muted grey. */}
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {d.candidateDisplayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
        <div className="mt-3">
          <CaseStatusChip status={d.status} />
        </div>
      </header>

      <div className="mt-6 max-w-4xl">
        <TrustStageBanner stage={trustQ.data ?? null} aiAvailable={d.aiAvailable} />
      </div>

      <div className="mt-6">
        <CaseSteps current={d.status} />
        <NextStep status={d.status} />
      </div>

      {/* ---- The interview notes, carried here automatically ----
           The recruiter wrote these under Q1-Q8 during the interview. They
           arrive under the same question, with the same text, and are never
           retyped. A note is SOURCE material: it becomes evidence only when a
           human confirms an extract from it. */}
      {["interview_complete", "evidence_review", "assessed", "reported"].includes(d.status) && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-notes">
          <h2 id="s-notes" className="text-lg font-semibold text-foreground">
            {t("iiu.ev.notes.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("iiu.ev.notes.body")}</p>
          {/* Stated once, where the six kinds of material first appear
              together. The distinction is the product; leaving it to be
              inferred from styling is how it gets lost. */}
          <MaterialLegend />
          <ul className="mt-3 space-y-2">
            {d.questions.map((qq) => {
              const qNotes = (d.session?.notes ?? []).filter((n) => n.questionId === qq.id);
              return (
                <li key={qq.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="work">{qq.code}</Chip>
                    {qNotes.length === 0 && <Chip tone="attention">{t("iiu.ev.notes.none")}</Chip>}
                  </div>
                  {qNotes.map((n) => (
                    <div key={n.id} className="mt-2">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                        {n.body}
                      </p>
                      <p className="mt-1">
                        <MaterialBadge state="note" />
                      </p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- The one AI action ---- */}
      {d.aiAvailable && ["interview_complete", "evidence_review"].includes(d.status) && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-analyse">
          <h2 id="s-analyse" className="text-lg font-semibold text-foreground">
            {t("iiu.ev.analyse")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("iiu.ev.analyse.body")}</p>
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-3`}
            onClick={() => analyse.mutate()}
            disabled={analyse.isPending}
          >
            {analyse.isPending ? t("iiu.ev.analysing") : t("iiu.ev.analyse")}
          </button>

          {analyse.isPending && (
            <div className="mt-3 max-w-3xl">
              <State kind="aiRunning" />
            </div>
          )}
          {analyse.isError && (
            <div className="mt-3 max-w-3xl">
              <State kind="aiUnavailable" message={interviewErrorMessage(analyse.error, t)} />
            </div>
          )}

          {analyse.data && (
            <div className="mt-3 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("iiu.ev.analyse.steps")}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {analyse.data.steps.map((st) => (
                  <li key={st.task} className="flex flex-wrap items-center gap-2">
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
                    <span className="text-xs text-muted-foreground">
                      {t("iiu.ev.stage")}: {st.trustStage}
                    </span>
                  </li>
                ))}
              </ul>
              {analyse.data.steps.some((st) => st.status !== "succeeded") && (
                <p className="mt-2 text-sm text-muted-foreground">{t("iiu.ev.partial")}</p>
              )}
              {analyse.data.providerMode && (
                <div className="mt-3">
                  <ProviderModeChip mode={analyse.data.providerMode} />
                  <div className="mt-2">
                    <ProviderModeNote mode={analyse.data.providerMode} />
                  </div>
                </div>
              )}
            </div>
          )}

          {analyse.data && analyse.data.withheld.length > 0 && (
            <div className="mt-3 max-w-3xl">
              <WithheldPanel withheld={analyse.data.withheld} />
            </div>
          )}
        </section>
      )}

      {/* ---- Human evidence authoring ----
           Shown when AI is off, because then it is the only way evidence is
           created at all. The AI extraction section below is hidden in that
           state rather than left as an empty machine with a dead button. */}
      {!d.aiAvailable && ["interview_complete", "evidence_review"].includes(d.status) && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-author">
          <h2 id="s-author" className="text-lg font-semibold text-foreground">
            {t("iiu.ev.manual.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("iiu.ev.manual.body")}</p>
          <form
            className="mt-3 space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (evQuestion === "" || evExcerpt.trim() === "") return;
              authorEv.mutate();
            }}
          >
            <div>
              <label htmlFor="ev-q" className="text-xs font-medium text-foreground">
                {t("iiu.ev.manual.question")}
              </label>
              <select
                id="ev-q"
                value={evQuestion}
                onChange={(e) => setEvQuestion(e.target.value)}
                className={FIELD}
                required
              >
                <option value="">{t("iiu.ev.manual.choose")}</option>
                {d.questions.map((qq) => (
                  <option key={qq.id} value={qq.id}>
                    {qq.code} — {qq.promptSv}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ev-x" className="text-xs font-medium text-foreground">
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
            </div>
            {authorEv.isError && (
              <Panel tone="governance" role="alert" title={t("iiu.ev.manual.failed")}>
                <p>{interviewErrorMessage(authorEv.error, t)}</p>
              </Panel>
            )}
            <button type="submit" className={PRIMARY_BUTTON} disabled={authorEv.isPending}>
              {authorEv.isPending ? t("iiu.pp.saving") : t("iiu.ev.manual.save")}
            </button>
          </form>
        </section>
      )}

      {/* ---- Human review ---- */}
      {/* This section reviews AI PROPOSALS. With AI off there are never any, so
          showing it would be an empty machine above the evidence that matters.
          The confirmed-evidence list below is rendered either way. */}
      {(d.aiAvailable || d.proposals.length > 0) && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-review">
          <h2 id="s-review" className="text-lg font-semibold text-foreground">
            {t("iiu.ev.s2.title")}
            {pending.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({pending.length} {t("iiu.ev.pending")})
              </span>
            )}
          </h2>

          {d.proposals.length === 0 ? (
            <div className="mt-3">
              <State kind="empty">{t("iiu.ev.noproposals")}</State>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {d.proposals.map((p) => {
                const qq = d.questions.find((x) => x.id === p.questionId);
                const reviewed = p.reviewState !== "pending";
                return (
                  <li key={p.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <MaterialBadge state="ai" />
                      {qq && <Chip>{qq.code}</Chip>}
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
                      {p.extractionConfidence !== null && (
                        <Chip srPrefix={t("iiu.ev.extraction.srprefix")}>
                          {t("iiu.ev.extraction.chip")} {Math.round(p.extractionConfidence * 100)}%
                        </Chip>
                      )}
                    </div>

                    {/* The recruiter's own words first, then what the model
                        made of them. Read in this order the proposal is
                        checkable; read the other way round it is an assertion. */}
                    {(() => {
                      const src = (d.session?.notes ?? []).find((n) => n.id === p.noteId);
                      if (!src) return null;
                      return (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("iiu.ev.fromnote")}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {src.body}
                          </p>
                        </div>
                      );
                    })()}

                    <p className="mt-3 text-xs font-medium text-muted-foreground">
                      {t("iiu.ev.proposed")}
                    </p>
                    <blockquote className="mt-1 border-l-2 border-violet-700/40 pl-3 text-sm leading-relaxed text-foreground">
                      {p.excerpt}
                    </blockquote>

                    <FiveEPanel value={p.fiveE} />

                    <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div>
                        <dt className="inline font-medium">{t("iiu.ev.whyrelevant")}</dt>
                        <dd className="inline">{p.relevanceRationale || "—"}</dd>
                      </div>
                      {p.uncertaintyNote && (
                        <div>
                          <dt className="inline font-medium">{t("iiu.ev.uncertainty")}</dt>
                          <dd className="inline">{p.uncertaintyNote}</dd>
                        </div>
                      )}
                      {p.prohibitedConclusionNote && (
                        <div>
                          <dt className="inline font-medium">{t("iiu.ev.mustnot")}</dt>
                          <dd className="inline">{p.prohibitedConclusionNote}</dd>
                        </div>
                      )}
                      <div className="pt-1 text-[11px]">{t("iiu.ev.extraction.note")}</div>
                    </dl>

                    {!reviewed && (
                      <div className="mt-3">
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
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={PRIMARY_BUTTON}
                                disabled={review.isPending || editText.trim() === ""}
                                onClick={() =>
                                  review.mutate({ proposalId: p.id, decision: "edit" })
                                }
                              >
                                Spara korrigering
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={BUTTON}
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({ proposalId: p.id, decision: "accept" })
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
                              Redigera
                            </button>
                            <button
                              type="button"
                              className={BUTTON}
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({ proposalId: p.id, decision: "reject" })
                              }
                            >
                              Avvisa
                            </button>
                            <button
                              type="button"
                              className={BUTTON}
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({ proposalId: p.id, decision: "unresolved" })
                              }
                            >
                              {t("iiu.ev.markunresolved")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {review.isError && (
            <div className="mt-3">
              <Panel tone="governance" role="alert" title={t("iiu.ev.reviewfailed")}>
                <p>{interviewErrorMessage(review.error, t)}</p>
              </Panel>
            </div>
          )}
        </section>
      )}

      {/* ---- Confirmed evidence ---- */}
      {d.evidence.length > 0 && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-confirmed">
          <h2 id="s-confirmed" className="text-lg font-semibold text-foreground">
            {t("iiu.ev.confirmed.title")}
          </h2>
          <ul className="mt-3 space-y-2">
            {d.evidence.map((e) => {
              const qq = d.questions.find((x) => x.id === e.questionId);
              return (
                <li
                  key={e.id}
                  className="rounded-md border border-teal-700/30 bg-teal-700/5 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {qq && <Chip>{qq.code}</Chip>}
                    <MaterialBadge state="confirmed" />
                    <Chip srPrefix={t("iiu.ev.srprefix.origin")}>
                      {e.origin === "human_authored"
                        ? t("iiu.ev.origin.human")
                        : e.origin === "ai_proposed_edited"
                          ? t("iiu.ev.origin.ai_corrected")
                          : t("iiu.ev.origin.ai_confirmed")}
                    </Chip>
                  </div>
                  <p className="mt-2 text-foreground">{e.excerpt}</p>
                  {e.originalExcerpt && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium">{t("iiu.ev.aioriginal")}: </span>
                      {e.originalExcerpt}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Human assessment ---- */}
      <section className="mt-10 max-w-4xl" aria-labelledby="s-assess">
        <h2 id="s-assess" className="text-lg font-semibold text-foreground">
          {t("iiu.ev.s3.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("iiu.ev.s3.body")}</p>
        {/* The badge that says whose judgement this is. The section title
            says it too, but a recruiter scanning the page sees shapes before
            they read sentences, and this is the one place where mistaking
            the author would matter most. */}
        <p className="mt-2">
          <MaterialBadge state="assessment" />
        </p>
        <div className="mt-2">
          <LevelZeroNote />
        </div>

        <ul className="mt-4 space-y-3">
          {d.questions.map((qq) => {
            const existing = d.assessments.find((a) => a.questionId === qq.id);
            const evidenceCount = d.evidence.filter((e) => e.questionId === qq.id).length;
            return (
              <li key={qq.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="work">{qq.code}</Chip>
                  {evidenceCount > 0 ? (
                    <Chip tone="confirmed">
                      {evidenceCount} {t("iiu.ev.confirmedcount")}
                    </Chip>
                  ) : (
                    <Chip tone="attention">{t("iiu.ev.noconfirmed")}</Chip>
                  )}
                  {existing && (
                    <Chip
                      tone={existing.level === 0 ? "attention" : "confirmed"}
                      srPrefix={t("iiu.ev.level.srprefix")}
                    >
                      {t("iiu.ev.level")} {existing.level}
                    </Chip>
                  )}
                </div>
                <p className="mt-2 text-sm text-foreground">{qq.promptSv}</p>

                {existing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">{t("iiu.ev.motivering")}</span>
                    {existing.rationale}
                  </p>
                ) : (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const lvl = levels[qq.id];
                      const rat = rationales[qq.id] ?? "";
                      // Silent returns taught the interviewer nothing about
                      // why the button did nothing. Say it instead.
                      if (lvl === undefined) {
                        setAssessHint((st) => ({ ...st, [qq.id]: "level" }));
                        return;
                      }
                      if (rat.trim() === "") {
                        setAssessHint((st) => ({ ...st, [qq.id]: "rationale" }));
                        return;
                      }
                      setAssessHint((st) => ({ ...st, [qq.id]: null }));
                      assess.mutate({ questionId: qq.id, level: lvl, rationale: rat });
                    }}
                  >
                    {/* The database refuses a level above 0 without confirmed
                        evidence, and rightly so. Saying that AFTER the save
                        button is a bad way to teach a rule the interviewer
                        could have been told up front — which is exactly how
                        the owner met it in UAT. So the rule is shown here,
                        in the same place the choice is made. */}
                    {evidenceCount === 0 && (
                      <Panel tone="attention" title={t("iiu.ev.needevidence.title")}>
                        <p>{t("iiu.ev.needevidence.body")}</p>
                        <p className="mt-2 flex flex-wrap gap-2">
                          <a
                            href="#s-author"
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {t("iiu.ev.needevidence.cta.evidence")}
                          </a>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            onClick={() => setLevels((st) => ({ ...st, [qq.id]: 0 }))}
                          >
                            {t("iiu.ev.needevidence.cta.zero")}
                          </button>
                        </p>
                      </Panel>
                    )}

                    <fieldset>
                      <legend className="text-xs font-medium text-foreground">
                        {t("iiu.ev.level")}
                      </legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {[...qq.anchors]
                          .sort((a, b) => a.level - b.level)
                          .map((a) => {
                            // Levels 1-4 are unreachable until evidence exists.
                            // Disabled rather than hidden: the interviewer
                            // should see the scale they are working within.
                            const locked = a.level > 0 && evidenceCount === 0;
                            return (
                              <label
                                key={a.id}
                                title={locked ? t("iiu.ev.needevidence.locked") : undefined}
                                className={`rounded-md border px-3 py-1.5 text-xs ${
                                  locked
                                    ? "cursor-not-allowed border-border opacity-50"
                                    : "cursor-pointer"
                                } ${
                                  levels[qq.id] === a.level
                                    ? "border-accent font-semibold"
                                    : "border-border"
                                } ${a.level === 0 ? "bg-amber-500/5" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`lvl-${qq.id}`}
                                  value={a.level}
                                  className="sr-only"
                                  disabled={locked}
                                  checked={levels[qq.id] === a.level}
                                  onChange={() => setLevels((st) => ({ ...st, [qq.id]: a.level }))}
                                />
                                {a.level} — {(lang === "en" ? a.labelEn : a.labelSv) ?? a.labelSv}
                                {locked && (
                                  <span className="sr-only">
                                    {" "}
                                    ({t("iiu.ev.needevidence.locked")})
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    </fieldset>
                    <div>
                      <label
                        htmlFor={`rat-${qq.id}`}
                        className="text-xs font-medium text-foreground"
                      >
                        {t("iiu.ev.rationale")}
                      </label>
                      <textarea
                        id={`rat-${qq.id}`}
                        rows={2}
                        className={FIELD}
                        value={rationales[qq.id] ?? ""}
                        onChange={(e) => setRationales((s) => ({ ...s, [qq.id]: e.target.value }))}
                      />
                    </div>
                    {/* Three different situations, three different messages.
                        Reusing the evidence guidance when a level simply had
                        not been picked told the interviewer to go and find
                        evidence they already had. */}
                    {assessHint[qq.id] === "level" && (
                      <p role="alert" className="text-xs text-destructive">
                        {evidenceCount === 0
                          ? t("iiu.ev.needevidence.body")
                          : t("iiu.ev.hint.level")}
                      </p>
                    )}
                    {assessHint[qq.id] === "rationale" && (
                      <p role="alert" className="text-xs text-destructive">
                        {t("iiu.ev.rationale.missing")}
                      </p>
                    )}
                    <button type="submit" className={BUTTON} disabled={assess.isPending}>
                      {t("iiu.ev.save")}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        {assess.isError && (
          <div className="mt-3">
            <Panel tone="governance" role="alert" title={t("iiu.ev.savefailed")}>
              <p className="whitespace-pre-line">{interviewErrorMessage(assess.error, t)}</p>
            </Panel>
          </div>
        )}

        {d.status === "evidence_review" && d.assessments.length === d.questions.length && (
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-4`}
            onClick={() => finishAssessing.mutate()}
            disabled={finishAssessing.isPending}
          >
            {t("iiu.ev.done")}
          </button>
        )}
      </section>

      {/* Panel Review sits between the individual assessments and the report:
          it is where several reviewers reconcile what they each concluded. Not
          every interview needs one, so the link is always available rather than
          gated -- the panel screen itself explains when a panel is appropriate
          and refuses to open one for a single reviewer. */}
      <Link
        to="/employer/$employerSlug/interview-intelligence/$caseId/panel"
        params={{ employerSlug, caseId }}
        className={`${BUTTON} mt-8 mr-2`}
      >
        {t("iiu.pl.title")}
      </Link>

      {["assessed", "reported"].includes(d.status) && (
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/report"
          params={{ employerSlug, caseId }}
          className={`${PRIMARY_BUTTON} mt-8`}
        >
          Till rapporten
        </Link>
      )}
    </>,
  );
}
