import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { saveWorkAction, saveWorkRisk } from "@/lib/security-work/analysis.functions";
import type { Action, Risk } from "@/lib/security-work/analysis-types";
import { useSecurityWorkspace } from "./context";
import {
  EmptyState,
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
import {
  RiskRating,
  SaveStatus,
  WorkStatus,
  usePortfolio,
  useSavedOperation,
  useWorkText,
} from "./analysis-ui";

export function RatingField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const l = useWorkText();
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className={selectClass}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{l("Okänt / inte bedömt", "Unknown / not assessed")}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
export function RiskEditor({
  assessmentId,
  risk,
  allowRating,
  onSaved,
  onDirtyChange,
  analysisType,
}: {
  assessmentId: string;
  risk?: Risk;
  allowRating: boolean;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  analysisType?: string;
}) {
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const save = useServerFn(saveWorkRisk);
  const op = useSavedOperation();
  const [id] = useState(() => risk?.id ?? crypto.randomUUID());
  const [baseVersion, setBaseVersion] = useState<number | null>(risk?.version ?? null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const readOnly = !canEdit || Boolean(risk && risk.status !== "proposed");
  const [title, setTitle] = useState(risk?.title ?? "");
  const [description, setDescription] = useState(risk?.description ?? "");
  const [likelihood, setLikelihood] = useState(risk?.likelihood ?? null);
  const [consequence, setConsequence] = useState(risk?.consequence ?? null);
  const [uncertainty, setUncertainty] = useState(risk?.uncertainty ?? "");
  const [rationale, setRationale] = useState(risk?.decision_rationale ?? "");
  return (
    <form
      className={`${panelClass} space-y-4`}
      onChangeCapture={() => {
        setDirty(true);
        onDirtyChange?.(true);
        op.clear();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (readOnly || op.state === "saving") return;
        const result = await op.run(() =>
          save({
            data: {
              workspaceId: workspace.id,
              id,
              assessmentId,
              version: baseVersion,
              title,
              description,
              likelihood: allowRating ? likelihood : null,
              consequence: allowRating ? consequence : null,
              uncertainty,
              rationale,
            },
          }),
        );
        if (result) {
          setBaseVersion(result.version);
          setDirty(false);
          onDirtyChange?.(false);
          clearWarning();
          onSaved();
        }
      }}
    >
      <fieldset className="space-y-4" disabled={readOnly || op.state === "saving"}>
        <h3 className="text-lg font-semibold">
          {risk ? l("Redigera riskförslag", "Edit risk proposal") : l("Ny risk", "New risk")}
        </h3>
        <TextField
          label={l("Riskhändelse", "Risk event")}
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextAreaField
          label={l(
            "Orsak, konsekvens och berörda skyddsvärden",
            "Cause, impact and protected values",
          )}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={16000}
        />
        {!allowRating && (
          <p className="text-sm text-muted-foreground">
            {l(
              "Definiera skalsteg, tidshorisont och riskacceptans under Uppdrag innan du anger bedömningsvärden.",
              "Define scale levels, time horizon and risk acceptance under Assignment before entering ratings.",
            )}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <RatingField
            label={l("Sannolikhet", "Likelihood")}
            value={likelihood}
            onChange={setLikelihood}
            disabled={!allowRating}
          />
          <RatingField
            label={l("Konsekvens", "Consequence")}
            value={consequence}
            onChange={setConsequence}
            disabled={!allowRating}
          />
        </div>
        <RiskRating
          likelihood={allowRating ? likelihood : null}
          consequence={allowRating ? consequence : null}
          colourOverride={analysisType === "rsa" ? undefined : null}
        />
        <TextAreaField
          label={l("Motivering och underlag", "Rationale and evidence")}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={8000}
        />
        <TextAreaField
          label={l("Osäkerhet och saknade uppgifter", "Uncertainty and missing information")}
          value={uncertainty}
          onChange={(e) => setUncertainty(e.target.value)}
          maxLength={8000}
        />
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton disabled={readOnly || op.state === "saving"} type="submit">
          {l("Spara riskförslag", "Save risk proposal")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}
export function ActionEditor({
  assessmentId,
  action,
  onSaved,
  onDirtyChange,
}: {
  assessmentId: string;
  action?: Action;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const save = useServerFn(saveWorkAction);
  const op = useSavedOperation();
  const [id] = useState(() => action?.id ?? crypto.randomUUID());
  const [baseVersion, setBaseVersion] = useState<number | null>(action?.version ?? null);
  const [baseStatus, setBaseStatus] = useState(action?.status ?? "open");
  const [riskId] = useState(action?.risk_id ?? null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const readOnly =
    !canEdit ||
    ["completed", "cancelled"].includes(baseStatus) ||
    Boolean(action && ["completed", "cancelled"].includes(action.status));
  const [title, setTitle] = useState(action?.title ?? "");
  const [description, setDescription] = useState(action?.description ?? "");
  const [rationale, setRationale] = useState(action?.decision_rationale ?? "");
  const [evidence, setEvidence] = useState(action?.completion_evidence ?? "");
  const [status, setStatus] = useState(action?.status ?? "open");
  const [priority, setPriority] = useState(action?.priority ?? "medium");
  const [due, setDue] = useState(action?.due_date ?? "");
  const [assignee, setAssignee] = useState(action?.assignee_user_id ?? "");
  return (
    <form
      className={`${panelClass} space-y-4`}
      onChangeCapture={() => {
        setDirty(true);
        onDirtyChange?.(true);
        op.clear();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (readOnly || op.state === "saving") return;
        const result = await op.run(() =>
          save({
            data: {
              workspaceId: workspace.id,
              id,
              assessmentId,
              version: baseVersion,
              riskId,
              title,
              description,
              rationale,
              completionEvidence: evidence,
              status: status as "open",
              priority: priority as "medium",
              dueDate: due || null,
              assigneeUserId: assignee || null,
            },
          }),
        );
        if (result) {
          setBaseVersion(result.version);
          setBaseStatus(result.status);
          setDirty(false);
          onDirtyChange?.(false);
          clearWarning();
          onSaved();
        }
      }}
    >
      <fieldset className="space-y-4" disabled={readOnly || op.state === "saving"}>
        <h3 className="text-lg font-semibold">
          {action ? l("Följ upp åtgärd", "Follow up action") : l("Ny åtgärd", "New action")}
        </h3>
        <TextField
          label={l("Åtgärd", "Action")}
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextAreaField
          label={l("Beskrivning", "Description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={16000}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={l("Ansvarig", "Owner")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">{l("Inte tilldelad", "Unassigned")}</option>
                <option value={user.id}>{l("Jag", "Me")}</option>
                {action?.assignee_user_id && action.assignee_user_id !== user.id && (
                  <option value={action.assignee_user_id}>
                    {l("Nuvarande ansvarig", "Current owner")}
                  </option>
                )}
              </select>
            )}
          </Field>
          <TextField
            type="date"
            label={l("Förfallodatum", "Due date")}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={l("Prioritet", "Priority")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {[
                  ["low", l("Låg", "Low")],
                  ["medium", l("Medel", "Medium")],
                  ["high", l("Hög", "High")],
                  ["urgent", l("Brådskande", "Urgent")],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Status">
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {[
                  ["open", l("Öppen", "Open")],
                  ["in_progress", l("Pågår", "In progress")],
                  ["blocked", l("Blockerad", "Blocked")],
                  ["completed", l("Slutförd", "Completed")],
                  ["cancelled", l("Avbruten", "Cancelled")],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <TextAreaField
          label={l("Beslutsmotivering", "Decision rationale")}
          required={status === "completed" || status === "cancelled"}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={8000}
        />
        {status === "completed" && (
          <TextAreaField
            label={l("Underlag som visar att åtgärden är slutförd", "Evidence of completion")}
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            maxLength={8000}
          />
        )}
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton disabled={readOnly || op.state === "saving"} type="submit">
          {l("Spara åtgärd", "Save action")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}
export function SecurityRisksActions() {
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const query = usePortfolio();
  const [edit, setEdit] = useState<string | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const changeEditor = (id: string) => {
    if (
      editDirty &&
      !window.confirm(
        l(
          "Du har osparade ändringar. Vill du kasta dem?",
          "You have unsaved changes. Discard them?",
        ),
      )
    )
      return;
    setEdit(edit === id ? null : id);
    setEditDirty(false);
  };
  if (query.isPending) return <LoadingState />;
  if (query.error?.message === "ACCESS_DENIED" || !query.data)
    return (
      <WorkError
        code={query.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <>
      {query.isError && (
        <WorkError code={query.error.message} onRetry={() => void query.refetch()} />
      )}
      <PageHeading
        title={l("Risker & åtgärder", "Risks & actions")}
        body={l(
          "Bedömningar hör till sin analys. Åtgärder följs upp här även efter rapportens godkännande.",
          "Ratings belong to their analysis. Follow up actions here, including after report approval.",
        )}
      />
      {!query.data.analyses.length && (
        <EmptyState
          title={l("Börja med en analys", "Start with an analysis")}
          body={l(
            "Risker och åtgärder kopplas till uppdragets underlag och bedömningar.",
            "Risks and actions are linked to the assignment's evidence and assessments.",
          )}
        >
          <WorkButton asChild>
            <Link to="/security-work/$workspaceId/analyses" params={{ workspaceId: workspace.id }}>
              {l("Öppna Analyser", "Open Analyses")}
            </Link>
          </WorkButton>
        </EmptyState>
      )}
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">
          {l("Åtgärder att följa upp", "Actions to follow up")}
        </h2>
        <ul className="divide-y divide-border">
          {query.data.actions.map((action) => (
            <li key={action.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{action.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {action.due_date ?? l("Datum saknas", "No due date")}
                    {action.due_date &&
                    action.due_date < new Date().toISOString().slice(0, 10) &&
                    !["completed", "cancelled"].includes(action.status)
                      ? l(" · Förfallen", " · Overdue")
                      : ""}
                  </p>
                </div>
                <WorkStatus status={action.status} />
                {canEdit && !["completed", "cancelled"].includes(action.status) && (
                  <WorkButton variant="outline" onClick={() => changeEditor(action.id)}>
                    {edit === action.id
                      ? l("Stäng redigering", "Close editor")
                      : l("Följ upp", "Follow up")}
                  </WorkButton>
                )}
              </div>
              {edit === action.id && (
                <ActionEditor
                  key={action.id}
                  action={action}
                  assessmentId={action.assessment_id}
                  onDirtyChange={setEditDirty}
                  onSaved={() => {
                    setEdit(null);
                    setEditDirty(false);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
        {!query.data.actions.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            {l("Inga åtgärder har lagts till ännu.", "No actions have been added yet.")}
          </p>
        )}
      </section>
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">{l("Risker", "Risks")}</h2>
        <ul className="divide-y divide-border">
          {query.data.risks.map((risk) => (
            <li key={risk.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-accent"
                to="/security-work/$workspaceId/analyses/$analysisId"
                params={{ workspaceId: workspace.id, analysisId: risk.assessment_id }}
              >
                {risk.title}
              </Link>
              <RiskRating
                likelihood={risk.likelihood}
                consequence={risk.consequence}
                colourOverride={
                  query.data.analyses.find((analysis) => analysis.id === risk.assessment_id)
                    ?.analysis_type === "rsa"
                    ? undefined
                    : null
                }
              />
              <WorkStatus status={risk.status} />
            </li>
          ))}
        </ul>
        {!query.data.risks.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            {l("Inga risker har registrerats ännu.", "No risks have been recorded yet.")}
          </p>
        )}
      </section>
    </>
  );
}
