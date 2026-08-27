// Sources, AI preparation and the human approval gate.
//
// The approval is the product's first real boundary: a draft brief is a
// suggestion, and only a person turning it into the active plan lets an
// interview start. The database enforces that too — starting a session from an
// unapproved plan is refused there, not just here.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Panel,
  State,
  TrustStageBanner,
  interviewErrorMessage,
  ProviderModeChip,
  ProviderModeNote,
  SOURCE_KIND_LABEL,
  PURPOSE_LABEL,
  uiLabel,
  WithheldPanel,
  ValidationChip,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  addCaseSource,
  approvePreparation,
  getInterviewCase,
  getTrustStage,
  markSourcesReady,
  runPreparation,
  startInterviewSession,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/prepare",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const ITEM_LABEL: Record<string, string> = {
  focus_area: "Fokusområde",
  relevant_experience: "Relevant erfarenhet",
  missing_information: "Saknad information",
  ambiguity: "Oklarhet",
  verification_point: "Verifieringspunkt",
  probe: "Godkänd följdfråga",
  clarification: "Förtydligande",
  prohibited_reminder: "Påminnelse",
};

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);

  const trustFn = useServerFn(getTrustStage);
  const addSourceFn = useServerFn(addCaseSource);
  const readyFn = useServerFn(markSourcesReady);
  const prepFn = useServerFn(runPreparation);
  const approveFn = useServerFn(approvePreparation);
  const startFn = useServerFn(startInterviewSession);

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

  const [kind, setKind] = useState<
    "job_description" | "candidate_cv" | "application_answers" | "employer_requirements"
  >("job_description");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [basis, setBasis] = useState("Berättigat intresse, rekrytering.");
  const [approvalNote, setApprovalNote] = useState("");

  const addSource = useMutation({
    mutationFn: () =>
      addSourceFn({
        data: {
          caseId,
          sourceKind: kind,
          label,
          contentText: text,
          purposeCode: "recruitment_interview",
          lawfulBasisNote: basis,
          origin:
            kind === "candidate_cv" || kind === "application_answers"
              ? "candidate_application"
              : "employer_supplied",
        },
      }),
    onSuccess: () => {
      setLabel("");
      setText("");
      void refresh();
    },
  });
  const markReady = useMutation({
    mutationFn: () => readyFn({ data: { caseId } }),
    onSuccess: refresh,
  });
  const generate = useMutation({
    mutationFn: () => prepFn({ data: { caseId } }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (planId: string) =>
      approveFn({ data: { planId, note: approvalNote || undefined } }),
    onSuccess: refresh,
  });
  const startSession = useMutation({
    mutationFn: () => startFn({ data: { caseId } }),
    onSuccess: () =>
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/interview",
        params: { employerSlug, caseId },
      }),
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
    const notFound = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={notFound ? "denied" : "error"}
        message={notFound ? undefined : interviewErrorMessage(q.error)}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  const genResult = generate.data;

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          <ValidationChip label={d.validationLabel} />
          <Chip>{d.packName ?? "—"}</Chip>
          {d.packContentHash && (
            <Chip srPrefix="Låst innehållssumma">
              <code className="font-mono text-[11px]">{d.packContentHash.slice(0, 10)}</code>
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

      {/* ---- 1. Sources ---- */}
      <section className="mt-8" aria-labelledby="s-sources">
        <h2 id="s-sources" className="text-lg font-semibold text-foreground">
          1. Underlag
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Varje källa delas upp i citerbara avsnitt. AI får bara påstå saker om kandidaten som pekar
          tillbaka på ett sådant avsnitt.
        </p>

        <div className="mt-4">
          {d.sources.length === 0 ? (
            <State kind="empty">Inget underlag ännu.</State>
          ) : (
            <ul className="space-y-2">
              {d.sources.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <Chip tone="work">{uiLabel(SOURCE_KIND_LABEL, s.kind)}</Chip>
                  <span className="font-medium text-foreground">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.passageCount} avsnitt</span>
                  <span className="text-xs text-muted-foreground">
                    · ändamål: {uiLabel(PURPOSE_LABEL, s.purposeCode)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {["draft", "sources_ready"].includes(d.status) && (
          <form
            className="mt-4 max-w-3xl space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (label && text) addSource.mutate();
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Lägg till underlag</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="src-kind" className="text-xs font-medium text-foreground">
                  Typ
                </label>
                <select
                  id="src-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                  className={FIELD}
                >
                  <option value="job_description">Annons / rollbeskrivning</option>
                  <option value="employer_requirements">Kravprofil</option>
                  <option value="candidate_cv">Kandidatens CV</option>
                  <option value="application_answers">Ansökningssvar</option>
                </select>
              </div>
              <div>
                <label htmlFor="src-label" className="text-xs font-medium text-foreground">
                  Etikett
                </label>
                <input
                  id="src-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className={FIELD}
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="src-text" className="text-xs font-medium text-foreground">
                Innehåll
              </label>
              <textarea
                id="src-text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={FIELD}
                required
                aria-describedby="src-text-hint"
              />
              <p id="src-text-hint" className="mt-1 text-xs text-muted-foreground">
                Tomrad separerar avsnitt. Varje avsnitt blir en citerbar enhet.
              </p>
            </div>
            <div>
              <label htmlFor="src-basis" className="text-xs font-medium text-foreground">
                Rättslig grund
              </label>
              <input
                id="src-basis"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                className={FIELD}
                required
              />
            </div>
            {addSource.isError && (
              <Panel tone="governance" role="alert" title="Underlaget kunde inte sparas">
                <p>{interviewErrorMessage(addSource.error)}</p>
              </Panel>
            )}
            <button type="submit" className={BUTTON} disabled={addSource.isPending}>
              {addSource.isPending ? "Sparar …" : "Lägg till"}
            </button>
          </form>
        )}

        {d.status === "draft" && d.sources.length > 0 && (
          <button
            type="button"
            className={`${BUTTON} mt-3`}
            onClick={() => markReady.mutate()}
            disabled={markReady.isPending}
          >
            Markera underlaget som klart
          </button>
        )}
      </section>

      {/* ---- 2. AI preparation ---- */}
      <section className="mt-10" aria-labelledby="s-prep">
        <h2 id="s-prep" className="text-lg font-semibold text-foreground">
          2. AI-förberedelse
        </h2>

        {d.status === "sources_ready" && (
          <div className="mt-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? "Arbetar …" : "Skapa intervjuunderlag"}
            </button>
          </div>
        )}
        {generate.isPending && (
          <div className="mt-3 max-w-3xl">
            <State kind="aiRunning" />
          </div>
        )}
        {genResult && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProviderModeChip mode={genResult.providerMode} />
          </div>
        )}
        {genResult && (
          <div className="mt-3 max-w-3xl">
            <ProviderModeNote mode={genResult.providerMode} />
          </div>
        )}
        {genResult && genResult.withheld.length > 0 && (
          <div className="mt-3 max-w-3xl">
            <WithheldPanel withheld={genResult.withheld} />
          </div>
        )}
        {genResult && genResult.status !== "succeeded" && (
          <div className="mt-3 max-w-3xl">
            <State
              kind={
                genResult.status === "abstained"
                  ? "aiAbstained"
                  : genResult.status === "provider_error" || genResult.status === "timed_out"
                    ? "aiUnavailable"
                    : "aiInvalid"
              }
              message={genResult.message ?? undefined}
            />
          </div>
        )}

        {d.plan && (
          <div className="mt-4 max-w-4xl space-y-4">
            <Panel tone="ai" title="AI-stödets roll i detta underlag">
              <p>{d.plan.aiDisclosure}</p>
            </Panel>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Roll">{d.plan.roleSummary ?? "—"}</Field>
              <Field label="Kandidatens underlag">{d.plan.candidateSummary ?? "—"}</Field>
              <Field label="Tidsplan">{d.plan.timePlan ?? "—"}</Field>
              <Field label="Introduktion">{d.plan.openingGuidance ?? "—"}</Field>
              <Field label="Avslut">{d.plan.closingGuidance ?? "—"}</Field>
            </div>

            <h3 className="text-sm font-semibold text-foreground">Underlagets punkter</h3>
            <ul className="space-y-2">
              {d.plan.items.map((i) => {
                const q8 = d.questions.find((qq) => qq.id === i.questionId);
                return (
                  <li key={i.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={i.itemKind === "missing_information" ? "attention" : "work"}>
                        {ITEM_LABEL[i.itemKind] ?? i.itemKind}
                      </Chip>
                      {q8 && <Chip>{q8.code}</Chip>}
                      <Chip tone={i.claimClass === "source_grounded" ? "confirmed" : "neutral"}>
                        {i.claimClass === "source_grounded"
                          ? "Källbelagd"
                          : i.claimClass === "governed_content"
                            ? "Styrt innehåll"
                            : "AI-förslag"}
                      </Chip>
                    </div>
                    <p className="mt-1.5 text-foreground">{i.statement}</p>
                    {i.sourceQuote && (
                      <blockquote className="mt-1.5 border-l-2 border-teal-700/40 pl-2 text-xs text-muted-foreground">
                        {i.sourceQuote}
                      </blockquote>
                    )}
                  </li>
                );
              })}
            </ul>

            {d.plan.status === "draft" && (
              <div className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
                <h3 className="text-sm font-semibold text-foreground">Godkänn intervjuplanen</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ett utkast är ett förslag. Först när du godkänner det blir det den aktiva planen,
                  och först då kan intervjun startas.
                </p>
                <label
                  htmlFor="approve-note"
                  className="mt-3 block text-xs font-medium text-foreground"
                >
                  Anteckning (frivillig) — vad ändrade du innan du godkände?
                </label>
                <textarea
                  id="approve-note"
                  rows={2}
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className={FIELD}
                />
                {approve.isError && (
                  <Panel tone="governance" role="alert" title="Kunde inte godkännas">
                    <p>{interviewErrorMessage(approve.error)}</p>
                  </Panel>
                )}
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => approve.mutate(d.plan!.id)}
                  disabled={approve.isPending}
                >
                  Godkänn intervjuplanen
                </button>
              </div>
            )}

            {d.plan.status === "approved" && (
              <Panel tone="confirmed" title="Intervjuplanen är godkänd">
                <p>Planen är den aktiva. Intervjun kan startas.</p>
              </Panel>
            )}
          </div>
        )}
      </section>

      {/* ---- 3. Start ---- */}
      {d.status === "prep_approved" && (
        <section className="mt-10" aria-labelledby="s-start">
          <h2 id="s-start" className="text-lg font-semibold text-foreground">
            3. Genomför intervjun
          </h2>
          {startSession.isError && (
            <div className="mt-3 max-w-3xl">
              <Panel tone="governance" role="alert" title="Intervjun kunde inte startas">
                <p>{interviewErrorMessage(startSession.error)}</p>
              </Panel>
            </div>
          )}
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-3`}
            onClick={() => startSession.mutate()}
            disabled={startSession.isPending}
          >
            Starta intervju
          </button>
        </section>
      )}

      {[
        "interview_in_progress",
        "interview_complete",
        "evidence_review",
        "assessed",
        "reported",
      ].includes(d.status) && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/interview"
            params={{ employerSlug, caseId }}
            className={BUTTON}
          >
            Intervjuvyn
          </Link>
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
            params={{ employerSlug, caseId }}
            className={BUTTON}
          >
            Evidensgranskning
          </Link>
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/report"
            params={{ employerSlug, caseId }}
            className={BUTTON}
          >
            Rapport
          </Link>
        </div>
      )}
    </>,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}
