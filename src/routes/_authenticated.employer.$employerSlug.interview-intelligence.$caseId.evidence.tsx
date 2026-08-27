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
  Panel,
  State,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  getInterviewCase,
  markAssessed,
  recordAssessment,
  reviewEvidenceProposal,
  runEvidenceExtraction,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/evidence",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const CORRECTION_CLASSES = [
  ["ai_model_error", "AI:t hade fel"],
  ["ambiguous_source", "Källan var tvetydig"],
  ["missing_source", "Källa saknades"],
  ["incorrect_mapping", "Fel koppling till fråga/dimension"],
  ["policy_violation", "Bröt mot en produktregel"],
  ["user_preference", "Jag föredrar en annan formulering"],
  ["reviewer_disagreement", "Granskare är oense"],
] as const;

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const extractFn = useServerFn(runEvidenceExtraction);
  const reviewFn = useServerFn(reviewEvidenceProposal);
  const assessFn = useServerFn(recordAssessment);
  const doneFn = useServerFn(markAssessed);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });

  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [correction, setCorrection] = useState<string>("ai_model_error");
  const [note, setNote] = useState("");
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});

  const extract = useMutation({
    mutationFn: () => extractFn({ data: { caseId } }),
    onSuccess: refresh,
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
      activeSection="assessments"
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
        message={nf ? undefined : (q.error as Error).message}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  const pending = d.proposals.filter((p) => p.reviewState === "pending");
  const result = extract.data;

  return shell(
    <>
      <nav aria-label="Brödsmulor" className="text-sm">
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
        <div className="mt-3">
          <CaseStatusChip status={d.status} />
        </div>
      </header>

      <div className="mt-6">
        <CaseSteps current={d.status} />
      </div>

      {/* ---- AI extraction ---- */}
      <section className="mt-8" aria-labelledby="s-extract">
        <h2 id="s-extract" className="text-lg font-semibold text-foreground">
          1. AI-förslag på evidens
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          AI läser intervjuanteckningarna och föreslår avgränsade utdrag. Ingenting av detta är
          evidens förrän en människa har bekräftat det.
        </p>
        {["interview_complete", "evidence_review"].includes(d.status) && (
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-3`}
            onClick={() => extract.mutate()}
            disabled={extract.isPending}
          >
            {extract.isPending ? "Arbetar …" : "Föreslå evidens"}
          </button>
        )}
        {extract.isPending && (
          <div className="mt-3 max-w-3xl">
            <State kind="aiRunning" />
          </div>
        )}
        {result && result.status !== "succeeded" && (
          <div className="mt-3 max-w-3xl">
            <State
              kind={
                result.status === "abstained"
                  ? "aiAbstained"
                  : result.status === "provider_error" || result.status === "timed_out"
                    ? "aiUnavailable"
                    : "aiInvalid"
              }
              message={result.message ?? undefined}
            />
          </div>
        )}
      </section>

      {/* ---- Human review ---- */}
      <section className="mt-8 max-w-4xl" aria-labelledby="s-review">
        <h2 id="s-review" className="text-lg font-semibold text-foreground">
          2. Mänsklig granskning
          {pending.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({pending.length} väntar)
            </span>
          )}
        </h2>

        {d.proposals.length === 0 ? (
          <div className="mt-3">
            <State kind="empty">Inga förslag ännu.</State>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {d.proposals.map((p) => {
              const qq = d.questions.find((x) => x.id === p.questionId);
              const reviewed = p.reviewState !== "pending";
              return (
                <li key={p.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="ai" srPrefix="Ursprung">
                      AI-förslag
                    </Chip>
                    {qq && <Chip>{qq.code}</Chip>}
                    <Chip
                      tone={
                        reviewed
                          ? p.reviewState === "rejected"
                            ? "governance"
                            : "confirmed"
                          : "attention"
                      }
                      srPrefix="Granskning"
                    >
                      {p.reviewState === "pending"
                        ? "Väntar på granskning"
                        : p.reviewState === "confirmed"
                          ? "Bekräftad"
                          : p.reviewState === "edited"
                            ? "Redigerad"
                            : p.reviewState === "rejected"
                              ? "Avvisad"
                              : "Olöst"}
                    </Chip>
                    {p.extractionConfidence !== null && (
                      <Chip srPrefix="Extraktionssäkerhet">
                        extraktion {Math.round(p.extractionConfidence * 100)}%
                      </Chip>
                    )}
                  </div>

                  <blockquote className="mt-3 border-l-2 border-violet-700/40 pl-3 text-sm leading-relaxed text-foreground">
                    {p.excerpt}
                  </blockquote>

                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>
                      <dt className="inline font-medium">Varför relevant: </dt>
                      <dd className="inline">{p.relevanceRationale || "—"}</dd>
                    </div>
                    {p.uncertaintyNote && (
                      <div>
                        <dt className="inline font-medium">Osäkerhet: </dt>
                        <dd className="inline">{p.uncertaintyNote}</dd>
                      </div>
                    )}
                    {p.prohibitedConclusionNote && (
                      <div>
                        <dt className="inline font-medium">Får inte tolkas som: </dt>
                        <dd className="inline">{p.prohibitedConclusionNote}</dd>
                      </div>
                    )}
                    <div className="pt-1 text-[11px]">
                      Extraktionssäkerhet beskriver hur säker extraktionen är — inte kandidatens
                      kvalitet, trovärdighet eller lämplighet. Den vägs aldrig samman.
                    </div>
                  </dl>

                  {!reviewed && (
                    <div className="mt-3">
                      {editing === p.id ? (
                        <div className="rounded-md border border-amber-600/40 bg-amber-500/5 p-3">
                          <label
                            htmlFor={`edit-${p.id}`}
                            className="text-xs font-medium text-foreground"
                          >
                            Korrigerat utdrag
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
                            Varför ändrade du det?
                          </label>
                          <select
                            id={`corr-${p.id}`}
                            value={correction}
                            onChange={(e) => setCorrection(e.target.value)}
                            className={FIELD}
                          >
                            {CORRECTION_CLASSES.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <label
                            htmlFor={`note-${p.id}`}
                            className="mt-2 block text-xs font-medium text-foreground"
                          >
                            Anteckning
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
                              onClick={() => review.mutate({ proposalId: p.id, decision: "edit" })}
                            >
                              Spara korrigering
                            </button>
                            <button
                              type="button"
                              className={BUTTON}
                              onClick={() => setEditing(null)}
                            >
                              Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={BUTTON}
                            disabled={review.isPending}
                            onClick={() => review.mutate({ proposalId: p.id, decision: "accept" })}
                          >
                            Bekräfta
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
                            onClick={() => review.mutate({ proposalId: p.id, decision: "reject" })}
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
                            Olöst
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
            <Panel tone="governance" role="alert" title="Granskningen kunde inte sparas">
              <p>{(review.error as Error).message}</p>
            </Panel>
          </div>
        )}
      </section>

      {/* ---- Confirmed evidence ---- */}
      {d.evidence.length > 0 && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-confirmed">
          <h2 id="s-confirmed" className="text-lg font-semibold text-foreground">
            Bekräftad evidens
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
                    <Chip tone="confirmed" srPrefix="Ursprung">
                      {e.origin === "human_authored"
                        ? "Skriven av människa"
                        : e.origin === "ai_proposed_edited"
                          ? "AI-förslag, korrigerat"
                          : "AI-förslag, bekräftat"}
                    </Chip>
                  </div>
                  <p className="mt-2 text-foreground">{e.excerpt}</p>
                  {e.originalExcerpt && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium">AI:ts ursprungliga formulering: </span>
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
          3. Mänsklig bedömning
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          En bedömning görs mot paketets ankare och kräver en skriven motivering. Det finns ingen
          totalpoäng, ingen viktning och ingen rangordning.
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
                  <Chip tone={evidenceCount > 0 ? "confirmed" : "attention"}>
                    {evidenceCount} bekräftad evidens
                  </Chip>
                  {existing && (
                    <Chip
                      tone={existing.level === 0 ? "attention" : "confirmed"}
                      srPrefix="Bedömd nivå"
                    >
                      Nivå {existing.level}
                    </Chip>
                  )}
                </div>
                <p className="mt-2 text-sm text-foreground">{qq.promptSv}</p>

                {existing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">Motivering: </span>
                    {existing.rationale}
                  </p>
                ) : (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const lvl = levels[qq.id];
                      const rat = rationales[qq.id] ?? "";
                      if (lvl === undefined || rat.trim() === "") return;
                      assess.mutate({ questionId: qq.id, level: lvl, rationale: rat });
                    }}
                  >
                    <fieldset>
                      <legend className="text-xs font-medium text-foreground">Nivå</legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {[...qq.anchors]
                          .sort((a, b) => a.level - b.level)
                          .map((a) => (
                            <label
                              key={a.id}
                              className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs ${
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
                                checked={levels[qq.id] === a.level}
                                onChange={() => setLevels((s) => ({ ...s, [qq.id]: a.level }))}
                              />
                              {a.level} — {a.labelSv}
                            </label>
                          ))}
                      </div>
                    </fieldset>
                    <div>
                      <label
                        htmlFor={`rat-${qq.id}`}
                        className="text-xs font-medium text-foreground"
                      >
                        Motivering (krävs)
                      </label>
                      <textarea
                        id={`rat-${qq.id}`}
                        rows={2}
                        className={FIELD}
                        value={rationales[qq.id] ?? ""}
                        onChange={(e) => setRationales((s) => ({ ...s, [qq.id]: e.target.value }))}
                      />
                    </div>
                    <button type="submit" className={BUTTON} disabled={assess.isPending}>
                      Spara bedömning
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        {assess.isError && (
          <div className="mt-3">
            <Panel tone="governance" role="alert" title="Bedömningen kunde inte sparas">
              <p className="whitespace-pre-line">{(assess.error as Error).message}</p>
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
            Klar med bedömningen
          </button>
        )}
      </section>

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
