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
import { useT } from "@/i18n/context";
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
  const { t } = useT();
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
                ? t("iiu.pl.state.individual")
                : p.state === "revealed"
                  ? t("iiu.pl.state.revealed")
                  : t("iiu.pl.state.closed")}
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

      <h2 className="mt-8 text-lg font-semibold text-foreground">Panelgranskning</h2>
      <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{t("iiu.pl.intro")}</p>

      {!p?.exists ? (
        <div className="mt-4 max-w-3xl">
          <InfoPanel tone="neutral" title={t("iiu.pl.none.title")}>
            <p>{t("iiu.pl.none.body")}</p>
          </InfoPanel>
        </div>
      ) : (
        <>
          {/* Who is on the panel and who still owes their own view. */}
          <section className="mt-6" aria-labelledby="panel-members">
            <h3 id="panel-members" className="text-sm font-semibold text-foreground">
              {t("iiu.pl.assessors")}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {p.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.userId.slice(0, 8)}
                  </span>
                  {m.submittedAt ? (
                    <Chip tone="confirmed" srPrefix="Status">
                      {t("iiu.pl.submitted")}
                    </Chip>
                  ) : (
                    <Chip tone="attention" srPrefix="Status">
                      {t("iiu.pl.stillassessing")}
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {sealed && (
            <div className="mt-4 max-w-3xl">
              <InfoPanel tone="attention" role="status" title={t("iiu.pl.sealed.title")}>
                <p>{t("iiu.pl.sealed.body")}</p>
              </InfoPanel>
            </div>
          )}

          {/* The assessments themselves. Before the reveal this list contains
                only the reader's own, because the database returned only
                those. */}
          <section className="mt-6" aria-labelledby="panel-assessments">
            <h3 id="panel-assessments" className="text-sm font-semibold text-foreground">
              {sealed ? t("iiu.pl.mine") : t("iiu.pl.perquestion")}
            </h3>
            {byQuestion.size === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("iiu.pl.noassessments")}</p>
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
                            {t("iiu.pl.disagree")}
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
                              <span className="text-foreground">
                                {t("iiu.ev.level")} {r.level}
                              </span>
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
              <InfoPanel tone="governance" role="alert" title={t("iiu.pl.actionfailed")}>
                <p className="whitespace-pre-line">
                  {interviewErrorMessage(submit.error ?? reveal.error ?? conclude.error, t)}
                </p>
              </InfoPanel>
            )}

            {p.iAmMember && !p.iHaveSubmitted && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">{t("iiu.pl.submit.title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("iiu.pl.submit.body")}</p>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending}
                >
                  {submit.isPending ? t("iiu.pl.submitting") : t("iiu.pl.submitcta")}
                </button>
              </div>
            )}

            {sealed && p.members.every((m) => m.submittedAt) && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold text-foreground">{t("iiu.pl.allsubmitted")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("iiu.pl.reveal.body")}</p>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => reveal.mutate()}
                  disabled={reveal.isPending}
                >
                  {reveal.isPending ? t("iiu.pl.revealing") : t("iiu.pl.revealcta")}
                </button>
              </div>
            )}

            {p.state === "revealed" && (
              <div className="rounded-lg border border-border p-4">
                <label htmlFor="panel-conclusion" className="text-sm font-semibold text-foreground">
                  Panelens slutsats
                </label>
                <p className="mt-1 text-sm text-muted-foreground">{t("iiu.pl.conclusion.hint")}</p>
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
                <p className="mt-2 text-xs text-muted-foreground">{t("iiu.pl.humanwritten")}</p>
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
