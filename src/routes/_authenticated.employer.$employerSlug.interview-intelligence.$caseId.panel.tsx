// Panel Review.
//
// Three stages, one direction, and the order is the whole control: each
// reviewer assesses alone, everybody's assessments are revealed together, and
// then a person writes what the panel concluded.
//
// The sealed stage is enforced in the DATABASE, not here. This screen shows a
// reviewer only their own assessments before the reveal because
// scp_iv_panel_visible_assessments returns only their own — not because the
// component filters them. A protection against anchoring that a second browser
// tab defeats is not a protection.
//
// What this screen deliberately never computes:
//
//   No average.       Three people's levels are three judgements, and their
//                     mean is not a fourth.
//   No vote.          Two-against-one is not a finding. Automating it would
//                     make disagreement disappear, which is the opposite of
//                     what a panel is for.
//   No AI.            Nothing here calls a model.
//
// Disagreement is SHOWN, plainly, per question. That is the fact a chair needs
// in order to run the discussion, and hiding it behind an aggregate would
// defeat the point of having assessed separately at all.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  getInterviewCase,
  getTrustStage,
  getPanel,
  submitToPanel,
  revealPanel,
  concludePanel,
} from "@/lib/interview-intelligence/runtime.functions";
import {
  BUTTON,
  PRIMARY_BUTTON,
  FIELD,
  CaseSteps,
  CaseStatusChip,
  Chip,
  Panel as InfoPanel,
  State,
  TrustStageBanner,
  interviewErrorMessage,
} from "@/components/employer/interview/InterviewUi";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/panel",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const qc = useQueryClient();

  const getCaseFn = useServerFn(getInterviewCase);

  const trustFn = useServerFn(getTrustStage);
  const panelFn = useServerFn(getPanel);
  const submitFn = useServerFn(submitToPanel);
  const revealFn = useServerFn(revealPanel);
  const concludeFn = useServerFn(concludePanel);

  const caseQ = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getCaseFn({ data: { caseId } }),
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
  const panelQ = useQuery({
    queryKey: ["ii", "panel", caseId],
    queryFn: () => panelFn({ data: { caseId } }),
    retry: false,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["ii"] });
  const submit = useMutation({
    mutationFn: () => submitFn({ data: { caseId } }),
    onSuccess: invalidate,
  });
  const reveal = useMutation({
    mutationFn: () => revealFn({ data: { caseId } }),
    onSuccess: invalidate,
  });
  const [conclusion, setConclusion] = useState("");
  const conclude = useMutation({
    mutationFn: () => concludeFn({ data: { caseId, conclusion } }),
    onSuccess: invalidate,
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

  if (caseQ.isLoading || panelQ.isLoading)
    return shell(
      <div className="px-4 py-16">
        <State kind="loading" />
      </div>,
    );
  if (caseQ.isError || !caseQ.data)
    return shell(
      <div className="px-4 py-16">
        <State kind="denied" />
      </div>,
    );

  const d = caseQ.data;
  const p = panelQ.data;
  const sealed = p?.state === "individual";

  // Grouped per question so a chair can see, in one place, that three people
  // said 2, 3 and 3 about Q4. Computed for DISPLAY only — no value derived from
  // it is stored, and none is offered as a conclusion.
  const byQuestion = new Map<
    string,
    typeof p extends undefined ? never : NonNullable<typeof p>["assessments"][number][]
  >();
  for (const a of p?.assessments ?? []) {
    const list = byQuestion.get(a.questionId) ?? [];
    list.push(a);
    byQuestion.set(a.questionId, list);
  }

  const questionLabel = (id: string) =>
    d.questions.find((q) => q.id === id)?.code ?? id.slice(0, 8);

  return shell(
    <div className="px-4 py-8 sm:px-6">
      <Link
        to="/employer/$employerSlug/interview-intelligence"
        params={{ employerSlug }}
        className="text-sm text-muted-foreground hover:underline"
      >
        Interview Intelligence
      </Link>

      <header className="mt-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.candidateDisplayName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          {p?.state && (
            <Chip tone={p.state === "individual" ? "attention" : "work"} srPrefix="Panelsteg">
              {p.state === "individual"
                ? "Enskild bedömning pågår"
                : p.state === "revealed"
                  ? "Bedömningarna är öppnade"
                  : "Panelen är avslutad"}
            </Chip>
          )}
        </div>
      </header>

      <div className="mt-6 max-w-4xl">
        <TrustStageBanner stage={trustQ.data ?? null} />
      </div>

      <div className="mt-6">
        <CaseSteps current={d.status} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Panelgranskning</h2>
      <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
        Varje bedömare gör sin egen bedömning först, utan att se de andras. När alla har lämnat in
        öppnas bedömningarna samtidigt. Panelen väger sedan samman i text — det finns inget
        medelvärde och ingen omröstning.
      </p>

      {!p?.exists ? (
        <div className="mt-4 max-w-3xl">
          <InfoPanel tone="neutral" title="Ingen panel är öppnad för den här intervjun">
            <p>
              En panel öppnas med minst två bedömare från er organisation. En ensam bedömare behöver
              ingen panel — det är en vanlig bedömning, och den gör ni på Evidenssidan.
            </p>
          </InfoPanel>
        </div>
      ) : (
        <>
          {/* Who is on the panel and who still owes their own view. */}
          <section className="mt-6" aria-labelledby="panel-members">
            <h3 id="panel-members" className="text-sm font-semibold text-foreground">
              Bedömare
            </h3>
            <ul className="mt-2 space-y-1.5">
              {p.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.userId.slice(0, 8)}
                  </span>
                  {m.submittedAt ? (
                    <Chip tone="confirmed" srPrefix="Status">
                      Har lämnat in
                    </Chip>
                  ) : (
                    <Chip tone="attention" srPrefix="Status">
                      Bedömer fortfarande
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {sealed && (
            <div className="mt-4 max-w-3xl">
              <InfoPanel tone="attention" role="status" title="Bedömningarna är förseglade">
                <p>
                  Du ser bara dina egna bedömningar tills alla har lämnat in. Det är avsiktligt: när
                  du väl har sett en kollegas nivå går den inte att sluta veta.
                </p>
              </InfoPanel>
            </div>
          )}

          {/* The assessments themselves. Before the reveal this list contains
                only the reader's own, because the database returned only
                those. */}
          <section className="mt-6" aria-labelledby="panel-assessments">
            <h3 id="panel-assessments" className="text-sm font-semibold text-foreground">
              {sealed ? "Dina bedömningar" : "Bedömningar per fråga"}
            </h3>
            {byQuestion.size === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Inga bedömningar att visa ännu.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {[...byQuestion.entries()].map(([qid, rows]) => {
                  const levels = [...new Set(rows.map((r) => r.level))];
                  const divergent = !sealed && levels.length > 1;
                  return (
                    <li key={qid} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {questionLabel(qid)}
                        </span>
                        {divergent && (
                          <Chip tone="attention" srPrefix="Panel">
                            Bedömarna gör olika bedömning
                          </Chip>
                        )}
                      </div>
                      <ul className="mt-2 space-y-2">
                        {rows.map((r) => (
                          <li key={r.assessmentId} className="text-sm">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {r.isMine ? "Du" : r.assessorId.slice(0, 8)}
                              </span>
                              <span className="text-foreground">Nivå {r.level}</span>
                            </p>
                            <p className="mt-0.5 text-muted-foreground">{r.rationale}</p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Actions, each gated by the stage it belongs to. */}
          <section className="mt-8 max-w-3xl space-y-4">
            {(submit.isError || reveal.isError || conclude.isError) && (
              <InfoPanel tone="governance" role="alert" title="Åtgärden kunde inte genomföras">
                <p className="whitespace-pre-line">
                  {interviewErrorMessage(submit.error ?? reveal.error ?? conclude.error)}
                </p>
              </InfoPanel>
            )}

            {p.iAmMember && !p.iHaveSubmitted && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">Lämna in din egen bedömning</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Du kan lämna in när du har bedömt samtliga kärnfrågor. Efter det ser du de andras
                  bedömningar när alla är klara.
                </p>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending}
                >
                  {submit.isPending ? "Lämnar in …" : "Lämna in min bedömning"}
                </button>
              </div>
            )}

            {sealed && p.members.every((m) => m.submittedAt) && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">Alla har lämnat in</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Öppna bedömningarna så att panelen kan diskutera dem.
                </p>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => reveal.mutate()}
                  disabled={reveal.isPending}
                >
                  {reveal.isPending ? "Öppnar …" : "Öppna bedömningarna"}
                </button>
              </div>
            )}

            {p.state === "revealed" && (
              <div className="rounded-lg border border-border p-4">
                <label htmlFor="panel-conclusion" className="text-sm font-semibold text-foreground">
                  Panelens slutsats
                </label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Skriv vad panelen kom fram till och varför, inklusive var ni var oense. Det finns
                  inget medelvärde och ingen omröstning — slutsatsen är ett resonemang, inte ett
                  tal.
                </p>
                <textarea
                  id="panel-conclusion"
                  className={`${FIELD} min-h-32`}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                />
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => conclude.mutate()}
                  disabled={conclude.isPending || conclusion.trim() === ""}
                >
                  {conclude.isPending ? "Sparar …" : "Spara panelens slutsats"}
                </button>
              </div>
            )}

            {p.state === "concluded" && p.conclusion && (
              <div className="rounded-lg border border-teal-700/30 bg-teal-700/10 p-4">
                <p className="text-sm font-semibold text-foreground">Panelens slutsats</p>
                <p className="mt-1 whitespace-pre-line text-sm text-foreground">{p.conclusion}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Skriven av en människa. De enskilda bedömningarna ovan står kvar oförändrade.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      <Link
        to="/employer/$employerSlug/interview-intelligence/$caseId/report"
        params={{ employerSlug, caseId }}
        className={`${BUTTON} mt-8`}
      >
        Till rapporten
      </Link>
    </div>,
  );
}
