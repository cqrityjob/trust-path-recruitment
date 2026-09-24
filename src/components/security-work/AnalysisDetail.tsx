import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  getWorkAnalysis,
  saveWorkAnalysis,
  saveWorkQuestion,
  saveWorkReport,
  reviseWorkAnalysis,
} from "@/lib/security-work/analysis.functions";
import {
  calibrated,
  contextSchema,
  initialContext,
  reportSections,
  type AnalysisSaveInput,
} from "@/lib/security-work/analysis-model";
import type {
  Analysis,
  AnalysisQuestion,
  AiQuestionBasis,
} from "@/lib/security-work/analysis-types";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";
import {
  Field,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  useUnsavedWarning,
} from "./ui";
import { SaveStatus, WorkStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import { AnalysisEvidence } from "./Evidence";
import { CitationEditor } from "./Citations";
import { AiDraft } from "./AiDraft";
import { ActionEditor, RatingField, RiskEditor } from "./RisksActions";

function formOf(row: Analysis): AnalysisSaveInput {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    version: row.version,
    analysis_type: row.analysis_type as AnalysisSaveInput["analysis_type"],
    title: row.title,
    purpose: row.purpose,
    scope: row.scope,
    horizon: row.horizon,
    context_snapshot: contextSchema.safeParse(row.context_snapshot).success
      ? contextSchema.parse(row.context_snapshot)
      : initialContext(""),
    situation: row.situation,
    affected_activity: row.affected_activity,
    assets: row.assets,
    threat: row.threat,
    vulnerability: row.vulnerability,
    existing_controls: row.existing_controls,
    uncertainty: row.uncertainty,
    assumptions: row.assumptions,
    proposed_measures: row.proposed_measures,
    professional_conclusion: row.professional_conclusion,
    likelihood: row.likelihood,
    consequence: row.consequence,
  };
}
function QuestionBasis({ basis, question }: { basis?: AiQuestionBasis; question: string }) {
  const l = useWorkText();
  if (!basis) return null;
  return (
    <aside
      data-testid="sw-question-basis"
      className="space-y-3 rounded-xl border border-border bg-secondary/25 p-4 text-sm"
    >
      <h4 className="font-semibold">
        {l("AI:s ursprungliga frågemotivering", "AI's original reason for the question")}
      </h4>
      <p className="whitespace-pre-wrap">
        {basis.reason ||
          l(
            "Ingen motivering angavs i det sparade utkastet.",
            "No reason was provided in the saved draft.",
          )}
      </p>
      <p className="text-muted-foreground">
        {l(
          "Motivering och citat bevaras från AI-utkastet. De uppdateras inte automatiskt när frågan eller underlaget ändras.",
          "The reason and citations are preserved from the AI draft. They do not automatically update when the question or evidence changes.",
        )}
      </p>
      {question !== basis.originalQuestion && (
        <p className="whitespace-pre-wrap">
          <strong>{l("Ursprunglig fråga: ", "Original question: ")}</strong>
          {basis.originalQuestion}
        </p>
      )}
      {basis.citations.map((citation, index) => (
        <details key={`${citation.sourceItemId}:${index}`}>
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            {citation.sourceTitle}
          </summary>
          <blockquote className="whitespace-pre-wrap border-l-2 border-border pl-3">
            {citation.quote}
          </blockquote>
        </details>
      ))}
    </aside>
  );
}
function QuestionEditor({
  assessmentId,
  question,
  basis,
  position,
  onCreated,
}: {
  assessmentId: string;
  question?: AnalysisQuestion;
  basis?: AiQuestionBasis;
  position: number;
  onCreated?: () => void;
}) {
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const save = useServerFn(saveWorkQuestion);
  const op = useSavedOperation();
  const [id] = useState(() => question?.id ?? crypto.randomUUID());
  const [baseVersion, setBaseVersion] = useState<number | null>(question?.version ?? null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const [text, setText] = useState(question?.question ?? "");
  const [answer, setAnswer] = useState(question?.answer ?? "");
  const [kind, setKind] = useState(question?.evidence_kind ?? "user_input");
  return (
    <form
      className={`${panelClass} space-y-4`}
      onChangeCapture={() => {
        setDirty(true);
        op.clear();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canEdit || op.state === "saving") return;
        const saved = await op.run(() =>
          save({
            data: {
              workspaceId: workspace.id,
              id,
              assessmentId,
              version: baseVersion,
              question: text,
              answer,
              evidenceKind: kind as "user_input" | "assumption",
              position,
            },
          }),
        );
        if (saved) {
          setBaseVersion(saved.version);
          setDirty(false);
          clearWarning();
          if (!question) onCreated?.();
        }
      }}
    >
      <QuestionBasis basis={basis} question={text} />
      <fieldset className="space-y-4" disabled={!canEdit || op.state === "saving"}>
        <TextField
          label={l("Kompletteringsfråga", "Follow-up question")}
          hint={l(
            "Fråga bara efter en kvarstående lucka. Beskriv vilket beslut svaret behövs för och kontrollera först accepterat underlag och tidigare svar.",
            "Ask only about a remaining gap. Explain which decision needs the answer and first check accepted evidence and existing answers.",
          )}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={4000}
        />
        <TextAreaField
          label={l(
            "Svar — skriv okänt när uppgiften saknas",
            "Answer — write unknown when information is missing",
          )}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={8000}
          hint={l(
            "Hänvisa till dokument och sida om svaret finns där. Ett antagande är inte en bekräftad uppgift; okänt får inte tolkas som låg risk.",
            "Refer to the document and page if it contains the answer. An assumption is not confirmed information; unknown must not be interpreted as low risk.",
          )}
        />
        <Field label={l("Uppgiftens karaktär", "Nature of information")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="user_input">
                {l("Uppgift från användaren", "User-provided information")}
              </option>
              <option value="assumption">{l("Antagande", "Assumption")}</option>
            </select>
          )}
        </Field>
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton type="submit" disabled={!canEdit || op.state === "saving"}>
          {l("Spara svar", "Save answer")}
        </WorkButton>
        <SaveStatus state={op.state === "idle" && question && !dirty ? "saved" : op.state} />
      </div>
    </form>
  );
}
export function SecurityAnalysisDetail({ analysisId }: { analysisId: string }) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, user, canEdit, deny } = useSecurityWorkspace();
  const read = useServerFn(getWorkAnalysis);
  const save = useServerFn(saveWorkAnalysis);
  const createReport = useServerFn(saveWorkReport);
  const revise = useServerFn(reviseWorkAnalysis);
  const navigate = useNavigate();
  const op = useSavedOperation();
  const query = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "analysis", analysisId],
    retry: false,
    queryFn: async () => {
      const r = await read({ data: { workspaceId: workspace.id, id: analysisId } });
      if (!r.ok) throw new Error(r.code);
      return r.data;
    },
  });
  const [form, setForm] = useState<AnalysisSaveInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [riskEdit, setRiskEdit] = useState<string | null>(null);
  const [actionNew, setActionNew] = useState(false);
  const [riskDirty, setRiskDirty] = useState(false);
  const [actionDirty, setActionDirty] = useState(false);
  const allowDiscard = (hasChanges: boolean) =>
    !hasChanges || window.confirm(l("Kasta osparade ändringar?", "Discard unsaved changes?"));
  const [newQuestion, setNewQuestion] = useState(false);
  const [revisionRequest] = useState(() => crypto.randomUUID());
  const [reportRequest] = useState(() => crypto.randomUUID());
  const clearWarning = useUnsavedWarning(dirty);
  useEffect(() => {
    if (query.data && !dirty) setForm(formOf(query.data.analysis));
  }, [query.data, dirty]);
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny]);
  async function persist() {
    if (!form) return false;
    const result = await op.run(() => save({ data: form }));
    if (!result) return false;
    setForm(formOf(result));
    setDirty(false);
    clearWarning();
    return true;
  }
  const patch = (change: Partial<AnalysisSaveInput>) => {
    setForm((old) => (old ? { ...old, ...change } : old));
    setDirty(true);
    op.clear();
  };
  if (query.isPending || (!form && !query.isError)) return <LoadingState />;
  if (
    (!query.data && query.isError) ||
    !query.data ||
    !form ||
    query.error?.message === "ACCESS_DENIED"
  )
    return (
      <WorkError
        code={query.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void query.refetch()}
      />
    );
  const detail = query.data;
  const editable = canEdit && detail.analysis.status === "draft";
  const allowRating = calibrated(form.context_snapshot, form.horizon);
  const tabs = [
    l("Uppdrag", "Assignment"),
    l("Underlag", "Evidence"),
    l("Komplettera", "Follow-ups"),
    l("Bedömning", "Assessment"),
    l("Rapport", "Report"),
  ];
  const saveButton = (
    <div className="flex flex-wrap items-center gap-3">
      <WorkButton
        type="button"
        disabled={!dirty || op.state === "saving"}
        onClick={() => void persist()}
      >
        {l("Spara ändringar", "Save changes")}
      </WorkButton>
      <SaveStatus state={op.state} />
      {dirty && (
        <span className="text-sm text-muted-foreground">
          {l("Osparade ändringar", "Unsaved changes")}
        </span>
      )}
    </div>
  );
  const fields = (definitions: [keyof AnalysisSaveInput, string][]) =>
    definitions.map(([key, label]) => (
      <TextAreaField
        key={key}
        label={label}
        value={String(form[key] ?? "")}
        onChange={(e) => patch({ [key]: e.target.value })}
        maxLength={16000}
        disabled={!editable}
      />
    ));
  return (
    <>
      <PageHeading
        title={detail.analysis.title}
        body={`${l("Metod", "Method")}: ${detail.analysis.method_version_id} · v${detail.analysis.version}`}
        action={<WorkStatus status={detail.analysis.status} />}
      />
      {detail.analysis.supersedes_id && (
        <p className="text-sm text-muted-foreground">
          {l(
            "Ny revision av en tidigare godkänd analys. Originalet finns kvar.",
            "A new revision of a previously approved analysis. The original is preserved.",
          )}
        </p>
      )}
      {!editable && canEdit && detail.analysis.status === "approved" && (
        <WorkButton
          variant="outline"
          disabled={op.state === "saving"}
          onClick={async () => {
            const id = await op.run(() =>
              revise({
                data: {
                  workspaceId: workspace.id,
                  id: analysisId,
                  version: detail.analysis.version,
                  requestId: revisionRequest,
                },
              }),
            );
            if (id)
              await navigate({
                to: "/security-work/$workspaceId/analyses/$analysisId",
                params: { workspaceId: workspace.id, analysisId: id },
              });
          }}
        >
          {l("Skapa nytt revisionsutkast", "Create revision draft")}
        </WorkButton>
      )}
      <nav aria-label={l("Analysens steg", "Analysis steps")} className="flex flex-wrap gap-2">
        {tabs.map((label, i) => (
          <WorkButton
            key={label}
            variant={step === i ? "default" : "outline"}
            aria-current={step === i ? "step" : undefined}
            disabled={op.state === "saving"}
            onClick={async () => {
              if (dirty && !(await persist())) return;
              setStep(i);
            }}
          >
            {i + 1}. {label}
          </WorkButton>
        ))}
      </nav>
      <WorkError
        code={op.error}
        onRetry={
          op.error === "CONFLICT"
            ? () => {
                setDirty(false);
                void query.refetch();
              }
            : undefined
        }
      />
      {
        <section hidden={step !== 0} className={`${panelClass} space-y-5`}>
          <h2 className="text-xl font-semibold">
            {l("Uppdrag och verksamhetskontext", "Assignment and organisational context")}
          </h2>
          <TextField
            label={l("Namn", "Title")}
            value={form.title}
            disabled={!editable}
            maxLength={500}
            onChange={(e) => patch({ title: e.target.value })}
          />
          {fields([
            ["purpose", l("Syfte", "Purpose")],
            ["scope", l("Omfattning", "Scope")],
            ["horizon", l("Tidshorisont", "Time horizon")],
          ])}
          <TextAreaField
            label={l(
              "Verksamhetskontext för denna analys",
              "Organisational context for this analysis",
            )}
            hint={l(
              "Detta är analysens egen kopia. Korrigeringar ändrar inte den gemensamma verksamhetsprofilen.",
              "This is the analysis's own copy. Corrections do not alter the shared organisation profile.",
            )}
            disabled={!editable}
            value={form.context_snapshot.profile}
            maxLength={20000}
            onChange={(e) =>
              patch({ context_snapshot: { ...form.context_snapshot, profile: e.target.value } })
            }
          />
          {form.analysis_type !== "monitoring" && (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                {l(
                  "Definiera bedömningsskala och riskacceptans",
                  "Define rating scales and risk acceptance",
                )}
              </summary>
              <p className="mb-4 text-sm text-muted-foreground">
                {l(
                  "Metodstödet namnger endast ändpunkterna: sannolikhet 1 mycket osannolikt / 5 mycket sannolikt och konsekvens 1 obetydlig / 5 katastrofal. Definiera vad samtliga fem nivåer betyder i detta uppdrag. Färgen i matrisen anger inte organisationens riskacceptans.",
                  "The method names only the endpoints: likelihood 1 very unlikely / 5 very likely and consequence 1 insignificant / 5 catastrophic. Define all five levels for this assignment. Matrix colours do not establish your organisation's risk acceptance.",
                )}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["likelihood", "consequence"] as const).map((kind) => (
                  <div key={kind} className="space-y-3">
                    {form.context_snapshot.calibration[kind].map((value, i) => (
                      <TextField
                        key={i}
                        label={`${kind === "likelihood" ? l("Sannolikhet", "Likelihood") : l("Konsekvens", "Consequence")} ${i + 1}`}
                        value={value}
                        disabled={!editable}
                        maxLength={1000}
                        onChange={(e) =>
                          patch({
                            context_snapshot: {
                              ...form.context_snapshot,
                              calibration: {
                                ...form.context_snapshot.calibration,
                                [kind]: form.context_snapshot.calibration[kind].map((old, n) =>
                                  n === i ? e.target.value : old,
                                ),
                              },
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
              <TextAreaField
                className="mt-4"
                label={l(
                  "Organisationens riskacceptans och beslutskriterier",
                  "Organisation's risk acceptance and decision criteria",
                )}
                value={form.context_snapshot.calibration.riskAcceptance}
                disabled={!editable}
                maxLength={4000}
                onChange={(e) =>
                  patch({
                    context_snapshot: {
                      ...form.context_snapshot,
                      calibration: {
                        ...form.context_snapshot.calibration,
                        riskAcceptance: e.target.value,
                      },
                    },
                  })
                }
              />
            </details>
          )}
          {editable && saveButton}
        </section>
      }
      {
        <AnalysisEvidence
          hidden={step !== 1}
          assessmentId={analysisId}
          inputs={detail.inputs}
          editable={editable}
        />
      }
      {
        <div hidden={step !== 2} className="space-y-5">
          <h2 className="text-xl font-semibold">
            {l("Komplettera det som saknas", "Fill information gaps")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {l(
              "Börja med accepterat underlag och tidigare svar. Lägg bara till frågor om sådant som fortfarande saknas för beslutet och ange varför. Håll egna uppgifter och antaganden åtskilda.",
              "Start with accepted evidence and previous answers. Add questions only about what is still needed for the decision, and explain why. Keep user-provided information separate from assumptions.",
            )}
          </p>
          {detail.questions.map((question) =>
            editable ? (
              <QuestionEditor
                key={question.id}
                question={question}
                basis={detail.questionBasis[question.id]}
                assessmentId={analysisId}
                position={question.position}
              />
            ) : (
              <article key={question.id} className={panelClass}>
                <h3 className="font-semibold">{question.question}</h3>
                <QuestionBasis
                  basis={detail.questionBasis[question.id]}
                  question={question.question}
                />
                <p className="mt-3 whitespace-pre-wrap">
                  {question.answer || l("Okänt", "Unknown")}
                </p>
              </article>
            ),
          )}
          {editable && (!detail.questions.length || newQuestion) && (
            <QuestionEditor
              assessmentId={analysisId}
              position={detail.questions.length}
              onCreated={() => setNewQuestion(false)}
            />
          )}
          {editable && !newQuestion && detail.questions.length > 0 && (
            <WorkButton variant="outline" onClick={() => setNewQuestion(true)}>
              {l("Lägg till fråga", "Add question")}
            </WorkButton>
          )}
        </div>
      }
      {
        <div hidden={step !== 3} className="space-y-5">
          <AiDraft
            analysisType={detail.analysis.analysis_type}
            assessmentId={analysisId}
            version={detail.analysis.version}
            jobs={detail.jobs}
            inputs={detail.inputs}
            questions={detail.questions}
            sources={detail.sourceItems}
            editable={editable}
            dirty={dirty}
          />
          <section className={`${panelClass} space-y-5`}>
            <h2 className="text-xl font-semibold">
              {l("Bedömning och motivering", "Assessment and rationale")}
            </h2>
            {fields([
              ["situation", l("Situationsbeskrivning", "Situation")],
              ["affected_activity", l("Berörd verksamhet", "Affected operations")],
              [
                "assets",
                l(
                  "Skyddsvärden och kritiska beroenden",
                  "Protected values and critical dependencies",
                ),
              ],
              ["threat", l("Hot och riskhändelser", "Threats and risk events")],
              ["vulnerability", l("Sårbarheter", "Vulnerabilities")],
              [
                "existing_controls",
                l(
                  "Befintliga skydd — ange okänt om uppgift saknas",
                  "Existing controls — state unknown if missing",
                ),
              ],
              [
                "uncertainty",
                l("Osäkerhet, luckor och motsägelser", "Uncertainty, gaps and contradictions"),
              ],
              ["assumptions", l("Antaganden", "Assumptions")],
              ["proposed_measures", l("Föreslagna åtgärder", "Proposed measures")],
              ["professional_conclusion", l("Professionell slutsats", "Professional conclusion")],
            ])}
            {form.analysis_type === "legacy_security" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <RatingField
                  label={l("Sannolikhet", "Likelihood")}
                  disabled={!editable}
                  value={form.likelihood}
                  onChange={(likelihood) => patch({ likelihood })}
                />
                <RatingField
                  label={l("Konsekvens", "Consequence")}
                  disabled={!editable}
                  value={form.consequence}
                  onChange={(consequence) => patch({ consequence })}
                />
              </div>
            )}
            {editable && saveButton}
          </section>
          <section className={panelClass}>
            <h2 className="text-xl font-semibold">{l("Källhänvisningar", "Citations")}</h2>
            {detail.citations.map((citation) => (
              <article key={citation.id} className="mt-4 border-l-2 border-border pl-4">
                <p className="font-medium">{citation.claim}</p>
                <blockquote className="mt-2 whitespace-pre-wrap text-sm">
                  {citation.excerpt}
                </blockquote>
                <p className="mt-2 text-xs text-muted-foreground">{citation.locator}</p>
              </article>
            ))}
          </section>
          {editable && (
            <CitationEditor
              targetId={analysisId}
              targetType="assessment"
              sources={detail.sourceItems.filter((source) =>
                detail.inputs.some(
                  (input) =>
                    input.source_item_id === source.id && input.review_status === "accepted",
                ),
              )}
            />
          )}
          <section className={`${panelClass} space-y-4`}>
            <h2 className="text-xl font-semibold">
              {l("Risker och åtgärder", "Risks and actions")}
            </h2>
            {detail.risks.map((risk) => (
              <div key={risk.id} className="border-b border-border py-3">
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-semibold">{risk.title}</p>
                  {editable && (
                    <WorkButton
                      variant="outline"
                      onClick={() => {
                        if (allowDiscard(riskDirty)) {
                          setRiskDirty(false);
                          setRiskEdit(riskEdit === risk.id ? null : risk.id);
                        }
                      }}
                    >
                      {l("Redigera", "Edit")}
                    </WorkButton>
                  )}
                </div>
                {riskEdit === risk.id && (
                  <RiskEditor
                    key={risk.id}
                    risk={risk}
                    analysisType={detail.analysis.analysis_type}
                    onDirtyChange={setRiskDirty}
                    assessmentId={analysisId}
                    allowRating={allowRating}
                    onSaved={() => {
                      setRiskDirty(false);
                      setRiskEdit(null);
                    }}
                  />
                )}
              </div>
            ))}
            {editable && (
              <div className="flex flex-wrap gap-3">
                <WorkButton
                  variant="outline"
                  disabled={dirty}
                  onClick={() => {
                    if (allowDiscard(riskDirty)) {
                      setRiskDirty(false);
                      setRiskEdit(riskEdit === "new" ? null : "new");
                    }
                  }}
                >
                  {l("Lägg till risk", "Add risk")}
                </WorkButton>
                <WorkButton
                  variant="outline"
                  disabled={dirty}
                  onClick={() => {
                    if (allowDiscard(actionDirty)) {
                      setActionDirty(false);
                      setActionNew(!actionNew);
                    }
                  }}
                >
                  {l("Lägg till åtgärd", "Add action")}
                </WorkButton>
              </div>
            )}
            {riskEdit === "new" && (
              <RiskEditor
                assessmentId={analysisId}
                analysisType={detail.analysis.analysis_type}
                onDirtyChange={setRiskDirty}
                allowRating={allowRating}
                onSaved={() => {
                  setRiskDirty(false);
                  setRiskEdit(null);
                }}
              />
            )}
            {actionNew && (
              <ActionEditor
                assessmentId={analysisId}
                onDirtyChange={setActionDirty}
                onSaved={() => {
                  setActionDirty(false);
                  setActionNew(false);
                }}
              />
            )}
            {detail.actions.map((action) => (
              <p key={action.id} className="text-sm">
                {action.title} · <WorkStatus status={action.status} />
              </p>
            ))}
          </section>
        </div>
      }
      {
        <section hidden={step !== 4} className={`${panelClass} space-y-5`}>
          <h2 className="text-xl font-semibold">
            {l("Rapport och godkännande", "Report and approval")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {l(
              "Rapporten följer analysens metod. Granska text och underlag innan du godkänner en bestämd version. Godkända versioner ändras aldrig.",
              "The report follows the analysis method. Review text and evidence before approving a specific version. Approved versions never change.",
            )}
          </p>
          {detail.reports.map((report) => (
            <div key={report.id} className="flex flex-wrap items-center gap-3">
              <WorkButton asChild variant="outline">
                <Link
                  to="/security-work/$workspaceId/reports/$reportId"
                  params={{ workspaceId: workspace.id, reportId: report.id }}
                >
                  {report.title} · v{report.version}
                </Link>
              </WorkButton>
              <WorkStatus status={report.status} />
            </div>
          ))}
          {editable && !detail.reports.length && (
            <WorkButton
              disabled={op.state === "saving"}
              onClick={async () => {
                const report = await op.run(() =>
                  createReport({
                    data: {
                      workspaceId: workspace.id,
                      id: reportRequest,
                      assessmentId: analysisId,
                      version: null,
                      title: detail.analysis.title,
                      language: lang,
                      sections: Object.fromEntries(
                        reportSections[form.analysis_type].map(([key]) => [key, ""]),
                      ),
                      uncertainty: form.uncertainty,
                    },
                  }),
                );
                if (report)
                  await navigate({
                    to: "/security-work/$workspaceId/reports/$reportId",
                    params: { workspaceId: workspace.id, reportId: report.id },
                  });
              }}
            >
              {l("Skapa rapportutkast", "Create report draft")}
            </WorkButton>
          )}
        </section>
      }
    </>
  );
}
