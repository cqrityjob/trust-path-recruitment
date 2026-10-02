import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/context";
import { saveWorkAction, saveWorkRisk } from "@/lib/security-work/analysis.functions";
import type { Action, Risk } from "@/lib/security-work/analysis-types";
import {
  decideSecurityRisk,
  saveSecurityProgrammeAction,
  saveSecurityProgrammeRisk,
} from "@/lib/security-work/programme/programme.functions";
import { isOpenAction, isOverdue } from "@/lib/security-work/programme/rules";
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
import {
  EvidenceLinks,
  Explain,
  OwnerSelect,
  Tag,
  ownerName,
  programmeKey,
  useProgramme,
} from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";

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

/** Risk under an analysis (unchanged behaviour: rating rules follow the analysis). */
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

/** Programme risk: protected asset → threat scenario → risk → owner. The
 * rating is the user's; AI may help describe the scenario (as a proposal). */
export function ProgrammeRiskEditor({
  risk,
  seedAssetId,
  onSaved,
}: {
  risk?: Risk;
  seedAssetId?: string | null;
  onSaved: (risk: Risk) => void;
}) {
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const save = useServerFn(saveSecurityProgrammeRisk);
  const op = useSavedOperation();
  const [id] = useState(() => risk?.id ?? crypto.randomUUID());
  const [version, setVersion] = useState<number | null>(risk?.version ?? null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const readOnly = !canEdit || Boolean(risk && risk.status !== "proposed");
  const linked =
    programme.data?.riskAssets
      .filter((link) => link.risk_id === risk?.id)
      .map((link) => link.asset_id) ?? [];
  const [title, setTitle] = useState(risk?.title ?? "");
  const [threat, setThreat] = useState(risk?.threat_scenario ?? "");
  const [description, setDescription] = useState(risk?.description ?? "");
  const [owner, setOwner] = useState<string | null>(risk?.owner_id ?? null);
  const [likelihood, setLikelihood] = useState(risk?.likelihood ?? null);
  const [consequence, setConsequence] = useState(risk?.consequence ?? null);
  const [uncertainty, setUncertainty] = useState(risk?.uncertainty ?? "");
  const [rationale, setRationale] = useState(risk?.decision_rationale ?? "");
  const [assetIds, setAssetIds] = useState<string[]>(() =>
    risk ? linked : seedAssetId ? [seedAssetId] : [],
  );
  const assets = programme.data?.assets.filter((asset) => asset.status === "active") ?? [];
  return (
    <form
      className={`${panelClass} space-y-4`}
      data-testid="sw-programme-risk-editor"
      onChangeCapture={() => {
        setDirty(true);
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
              version,
              title,
              description,
              threat_scenario: threat,
              owner_id: owner,
              likelihood,
              consequence,
              uncertainty,
              decision_rationale: rationale,
              assetIds,
            },
          }),
        );
        if (result) {
          setVersion(result.version);
          setDirty(false);
          clearWarning();
          onSaved(result);
        }
      }}
    >
      <fieldset className="space-y-4" disabled={readOnly || op.state === "saving"}>
        <h3 className="text-lg font-semibold">
          {risk ? l("Redigera risk", "Edit risk") : l("Ny risk", "New risk")}
        </h3>
        <Field
          label={l("Berörda skyddsvärden", "Protected assets affected")}
          hint={
            assets.length
              ? undefined
              : l(
                  "Inga skyddsvärden finns ännu. Risken kan sparas ändå.",
                  "No protected assets yet. The risk can still be saved.",
                )
          }
        >
          {(id) => (
            <div id={id} className="flex flex-wrap gap-2">
              {assets.map((asset) => {
                const on = assetIds.includes(asset.id);
                return (
                  <label
                    key={asset.id}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={(e) =>
                        setAssetIds(
                          e.target.checked
                            ? [...assetIds, asset.id]
                            : assetIds.filter((value) => value !== asset.id),
                        )
                      }
                    />
                    {asset.name}
                  </label>
                );
              })}
            </div>
          )}
        </Field>
        <TextField
          label={l("Risk (vad kan hända?)", "Risk (what could happen?)")}
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextAreaField
          label={l("Hot / scenario", "Threat / scenario")}
          hint={l(
            "Vem eller vad, hur och när. Security AI kan hjälpa dig beskriva scenariot – du godkänner texten.",
            "Who or what, how and when. Security AI can help describe the scenario; you approve the text.",
          )}
          value={threat}
          maxLength={8000}
          onChange={(e) => setThreat(e.target.value)}
        />
        <TextAreaField
          label={l(
            "Beskrivning: orsak, påverkan, befintligt skydd",
            "Description: cause, impact, existing controls",
          )}
          value={description}
          maxLength={16000}
          onChange={(e) => setDescription(e.target.value)}
        />
        <OwnerSelect
          label={l("Riskägare", "Risk owner")}
          value={owner}
          members={programme.data?.members ?? []}
          onChange={setOwner}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <RatingField
            label={l("Sannolikhet (1–5)", "Likelihood (1–5)")}
            value={likelihood}
            onChange={setLikelihood}
          />
          <RatingField
            label={l("Konsekvens (1–5)", "Consequence (1–5)")}
            value={consequence}
            onChange={setConsequence}
          />
        </div>
        <RiskRating likelihood={likelihood} consequence={consequence} />
        <TextAreaField
          label={l("Motivering och underlag", "Rationale and evidence")}
          value={rationale}
          maxLength={8000}
          onChange={(e) => setRationale(e.target.value)}
        />
        <TextAreaField
          label={l("Osäkerhet och saknade uppgifter", "Uncertainty and missing information")}
          value={uncertainty}
          maxLength={8000}
          onChange={(e) => setUncertainty(e.target.value)}
        />
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton disabled={readOnly || op.state === "saving"} type="submit">
          {l("Spara risk", "Save risk")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}

/** One action editor for every source: analysis, risk, gap, asset, plan or manual. */
export function ActionEditor({
  assessmentId,
  action,
  riskId: seedRiskId,
  gapId: seedGapId,
  assetId: seedAssetId,
  sourceKind,
  onSaved,
  onDirtyChange,
}: {
  assessmentId: string | null;
  action?: Action;
  riskId?: string | null;
  gapId?: string | null;
  assetId?: string | null;
  sourceKind?: "analysis" | "gap" | "risk" | "plan" | "manual";
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const l = useWorkText();
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const programme = useProgramme();
  const saveLegacy = useServerFn(saveWorkAction);
  const saveProgramme = useServerFn(saveSecurityProgrammeAction);
  const op = useSavedOperation();
  const [id] = useState(() => action?.id ?? crypto.randomUUID());
  const [baseVersion, setBaseVersion] = useState<number | null>(action?.version ?? null);
  const [baseStatus, setBaseStatus] = useState(action?.status ?? "open");
  const riskId = action?.risk_id ?? seedRiskId ?? null;
  const gapId = action?.gap_id ?? seedGapId ?? null;
  const [assetId, setAssetId] = useState(action?.asset_id ?? seedAssetId ?? null);
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
  const [assignee, setAssignee] = useState<string | null>(action?.assignee_user_id ?? null);
  const [approvalRequired, setApprovalRequired] = useState(action?.approval_required ?? false);
  const [approvalNote, setApprovalNote] = useState(action?.approval_note ?? "");
  const legacy =
    Boolean(assessmentId) &&
    !gapId &&
    !seedAssetId &&
    (sourceKind ?? action?.source_kind ?? "analysis") === "analysis";
  const assets = programme.data?.assets.filter((asset) => asset.status === "active") ?? [];
  return (
    <form
      className={`${panelClass} space-y-4`}
      data-testid="sw-action-editor"
      onChangeCapture={() => {
        setDirty(true);
        onDirtyChange?.(true);
        op.clear();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (readOnly || op.state === "saving") return;
        const result = await op.run(() =>
          legacy && assessmentId
            ? saveLegacy({
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
                  assigneeUserId: assignee,
                },
              })
            : saveProgramme({
                data: {
                  workspaceId: workspace.id,
                  id,
                  version: baseVersion,
                  assessmentId,
                  riskId,
                  gapId,
                  assetId,
                  source_kind:
                    sourceKind ??
                    (action?.source_kind as "manual") ??
                    (gapId ? "gap" : riskId ? "risk" : "manual"),
                  title,
                  description,
                  assigneeUserId: assignee,
                  dueDate: due || null,
                  priority: priority as "medium",
                  status: status as "open",
                  rationale,
                  completionEvidence: evidence,
                  approval_required: approvalRequired,
                  approval_note: approvalNote,
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
          <OwnerSelect
            label={l("Ansvarig", "Owner")}
            value={assignee}
            members={programme.data?.members ?? []}
            onChange={setAssignee}
          />
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
        {!legacy && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={l("Skyddsvärde", "Protected asset")}>
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={assetId ?? ""}
                  onChange={(e) => setAssetId(e.target.value || null)}
                >
                  <option value="">—</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
              />
              {l("Kräver godkännande vid slutförande", "Requires approval on completion")}
            </label>
          </div>
        )}
        <TextAreaField
          label={l("Beslutsmotivering", "Decision rationale")}
          required={status === "completed" || status === "cancelled" || status === "blocked"}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={8000}
        />
        {status === "completed" && (
          <>
            <TextAreaField
              label={l("Underlag som visar att åtgärden är slutförd", "Evidence of completion")}
              required
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              maxLength={8000}
            />
            {approvalRequired && !legacy && (
              <TextAreaField
                label={l(
                  "Godkännandenotering (kräver godkännanderätt)",
                  "Approval note (requires the approver right)",
                )}
                required
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                maxLength={4000}
                disabled={!membership.can_approve}
                hint={
                  membership.can_approve
                    ? undefined
                    : l(
                        "Endast en godkännare kan slutföra den här åtgärden.",
                        "Only an approver can complete this action.",
                      )
                }
              />
            )}
          </>
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
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit, membership } = useSecurityWorkspace();
  const portfolio = usePortfolio();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/security-work/$workspaceId/risks" });
  const decide = useServerFn(decideSecurityRisk);
  const op = useSavedOperation();
  const [edit, setEdit] = useState<string | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [creating, setCreating] = useState<"risk" | "action" | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<string | null>(search.riskId ?? null);
  const [actionFilter, setActionFilter] = useState<"open" | "overdue" | "high" | "all">("open");
  // The action just saved stays on screen whatever the filter says, so a
  // follow-up that completes or cancels it shows its new status instead of
  // vanishing from the "Open" list.
  const [recentlySavedActionId, setRecentlySavedActionId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    status: "accepted" | "closed";
    rationale: string;
  } | null>(null);
  useEffect(() => {
    if (search.new) setCreating(search.gapId ? "action" : "risk");
  }, [search.new, search.gapId]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) }),
      portfolio.refetch(),
    ]);
  };
  const risk = programme.data?.risks.find((row) => row.id === selectedRisk) ?? null;
  useAssistantContext({
    kind: risk ? "risk" : "workspace",
    id: risk?.id ?? null,
    title: risk?.title ?? t("sw.prog.nav.risks"),
    apply:
      risk && risk.status === "proposed"
        ? { riskId: risk.id, riskVersion: risk.version }
        : undefined,
  });
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
  if (programme.isPending || portfolio.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  const { risks, actions, assets, riskAssets, analyses, gaps, evidenceLinks, today } =
    programme.data;
  const openActions = actions.filter(isOpenAction);
  const visibleActions = actions.filter(
    (action) =>
      action.id === recentlySavedActionId ||
      (actionFilter === "all"
        ? true
        : actionFilter === "open"
          ? isOpenAction(action)
          : actionFilter === "overdue"
            ? isOverdue(action, today)
            : isOpenAction(action) && ["high", "urgent"].includes(action.priority)),
  );
  const assetNames = (riskId: string) =>
    riskAssets
      .filter((link) => link.risk_id === riskId)
      .map((link) => assets.find((asset) => asset.id === link.asset_id)?.name ?? "")
      .filter(Boolean);
  const clearSearch = () =>
    void navigate({
      to: "/security-work/$workspaceId/risks",
      params: { workspaceId: workspace.id },
      search: {},
      replace: true,
    });
  return (
    <>
      {portfolio.isError && (
        <WorkError code={portfolio.error.message} onRetry={() => void portfolio.refetch()} />
      )}
      <PageHeading
        title={t("sw.prog.nav.risks")}
        body={l(
          "Riskregistret och alla åtgärder på ett ställe. Skyddsvärde → hot → risk → ägare → åtgärd. Bedömningen är alltid din.",
          "The risk register and every action in one place. Protected asset → threat → risk → owner → action. The rating is always yours.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <WorkButton
                  onClick={() => setCreating(creating === "risk" ? null : "risk")}
                  data-testid="sw-add-risk"
                >
                  <Plus aria-hidden="true" />
                  {l("Ny risk", "New risk")}
                </WorkButton>
                <WorkButton
                  variant="outline"
                  onClick={() => setCreating(creating === "action" ? null : "action")}
                  data-testid="sw-add-action"
                >
                  <Plus aria-hidden="true" />
                  {l("Ny åtgärd", "New action")}
                </WorkButton>
              </>
            )}
            <AssistantButton />
          </div>
        }
      />
      {creating === "risk" && (
        <ProgrammeRiskEditor
          seedAssetId={search.assetId ?? null}
          onSaved={(saved) => {
            setCreating(null);
            setSelectedRisk(saved.id);
            clearSearch();
            void refresh();
          }}
        />
      )}
      {creating === "action" && (
        <ActionEditor
          assessmentId={null}
          gapId={search.gapId ?? null}
          riskId={
            search.riskId ?? gaps.find((gap) => gap.id === search.gapId)?.related_risk_id ?? null
          }
          assetId={
            search.assetId ?? gaps.find((gap) => gap.id === search.gapId)?.related_asset_id ?? null
          }
          sourceKind={search.gapId ? "gap" : search.riskId ? "risk" : "manual"}
          onSaved={() => {
            setCreating(null);
            clearSearch();
            void refresh();
          }}
        />
      )}
      <section className={`${panelClass} space-y-3`} data-testid="sw-actions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{l("Åtgärder", "Actions")}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={l("Filter", "Filter")}>
            {(["open", "overdue", "high", "all"] as const).map((value) => (
              <WorkButton
                key={value}
                variant={actionFilter === value ? "default" : "outline"}
                aria-pressed={actionFilter === value}
                className="min-h-10"
                onClick={() => {
                  setRecentlySavedActionId(null);
                  setActionFilter(value);
                }}
              >
                {
                  {
                    open: `${l("Öppna", "Open")} (${openActions.length})`,
                    overdue: `${l("Försenade", "Overdue")} (${openActions.filter((action) => isOverdue(action, today)).length})`,
                    high: l("Hög prioritet", "High priority"),
                    all: l("Alla", "All"),
                  }[value]
                }
              </WorkButton>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {visibleActions.map((action) => {
            const overdue = isOverdue(action, today);
            const source = action.gap_id ? gaps.find((gap) => gap.id === action.gap_id) : null;
            return (
              <li
                key={action.id}
                className="space-y-3 py-4"
                data-testid="sw-action-row"
                data-overdue={overdue}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{action.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {action.due_date ?? l("Datum saknas", "No due date")}
                      {overdue && ` · ${l("Försenad", "Overdue")}`} · {l("Ansvarig", "Owner")}:{" "}
                      {ownerName(action.assignee_user_id, undefined, user.id, t)}
                      {source && ` · ${l("Gap", "Gap")}: ${source.title}`}
                      {action.assessment_id && (
                        <>
                          {" · "}
                          <Link
                            to="/security-work/$workspaceId/analyses/$analysisId"
                            params={{ workspaceId: workspace.id, analysisId: action.assessment_id }}
                            className="text-accent underline-offset-4 hover:underline"
                          >
                            {analyses.find((analysis) => analysis.id === action.assessment_id)
                              ?.title ?? l("Analys", "Analysis")}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {["high", "urgent"].includes(action.priority) && isOpenAction(action) && (
                      <Tag tone="warn">
                        {action.priority === "urgent"
                          ? l("Brådskande", "Urgent")
                          : l("Hög prioritet", "High priority")}
                      </Tag>
                    )}
                    {action.approval_required && (
                      <Tag>{l("Kräver godkännande", "Approval required")}</Tag>
                    )}
                    <WorkStatus status={action.status} />
                    {canEdit && !["completed", "cancelled"].includes(action.status) && (
                      <WorkButton
                        variant="outline"
                        className="min-h-10"
                        onClick={() => changeEditor(action.id)}
                      >
                        {edit === action.id
                          ? l("Stäng redigering", "Close editor")
                          : l("Följ upp", "Follow up")}
                      </WorkButton>
                    )}
                  </div>
                </div>
                {edit === action.id && (
                  <>
                    <ActionEditor
                      key={action.version}
                      action={action}
                      assessmentId={action.assessment_id}
                      onDirtyChange={setEditDirty}
                      onSaved={() => {
                        setRecentlySavedActionId(action.id);
                        setEdit(null);
                        setEditDirty(false);
                        void refresh();
                      }}
                    />
                    <EvidenceLinks
                      targetKind="action"
                      targetId={action.id}
                      links={evidenceLinks}
                      onChanged={() => void refresh()}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {!visibleActions.length && (
          <p className="text-sm text-muted-foreground">
            {l("Inga åtgärder matchar urvalet.", "No actions match the filter.")}
          </p>
        )}
      </section>
      <section className={`${panelClass} space-y-3`} data-testid="sw-risks">
        <h2 className="text-xl font-semibold">{l("Riskregister", "Risk register")}</h2>
        {!risks.length && !analyses.length && (
          <EmptyState
            title={l("Inga risker ännu", "No risks yet")}
            body={l(
              "Skapa en risk direkt från ett skyddsvärde, eller via en riskanalys när du behöver ett fullständigt underlag.",
              "Create a risk directly from a protected asset, or through a risk analysis when you need full supporting evidence.",
            )}
          >
            <WorkButton asChild variant="outline">
              <Link
                to="/security-work/$workspaceId/analyses"
                params={{ workspaceId: workspace.id }}
                search={{ new: false }}
              >
                {l("Öppna Analyser", "Open Analyses")}
              </Link>
            </WorkButton>
          </EmptyState>
        )}
        <ul className="divide-y divide-border">
          {risks.map((row) => {
            const names = assetNames(row.id);
            const analysis = row.assessment_id
              ? analyses.find((candidate) => candidate.id === row.assessment_id)
              : null;
            const open = selectedRisk === row.id;
            return (
              <li
                key={row.id}
                className="space-y-3 py-4"
                data-testid="sw-risk-row"
                data-status={row.status}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    aria-expanded={open}
                    onClick={() => setSelectedRisk(open ? null : row.id)}
                  >
                    <span className="block font-semibold">{row.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {l("Ägare", "Owner")}: {ownerName(row.owner_id, undefined, user.id, t)}
                      {names.length > 0 && ` · ${l("Skyddsvärden", "Assets")}: ${names.join(", ")}`}
                      {analysis && ` · ${l("Analys", "Analysis")}: ${analysis.title}`}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.owner_id && row.status !== "closed" && (
                      <Tag tone="warn">{t("sw.prog.owner.unassigned")}</Tag>
                    )}
                    {names.length === 0 && assets.length > 0 && row.status !== "closed" && (
                      <Tag tone="warn">{l("Inget skyddsvärde", "No asset")}</Tag>
                    )}
                    <RiskRating
                      likelihood={row.likelihood}
                      consequence={row.consequence}
                      colourOverride={analysis?.analysis_type === "rsa" ? undefined : null}
                    />
                    <WorkStatus status={row.status} />
                  </div>
                </div>
                {open && (
                  <div className="space-y-3 border-t border-border pt-3">
                    {row.threat_scenario && (
                      <p className="text-sm">
                        <span className="font-semibold">
                          {l("Hot / scenario", "Threat / scenario")}:{" "}
                        </span>
                        {row.threat_scenario}
                      </p>
                    )}
                    {row.description && (
                      <p className="whitespace-pre-wrap text-sm">{row.description}</p>
                    )}
                    {row.decision_rationale && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {row.decision_rationale}
                      </p>
                    )}
                    {analysis ? (
                      <WorkButton asChild variant="outline" className="min-h-10">
                        <Link
                          to="/security-work/$workspaceId/analyses/$analysisId"
                          params={{ workspaceId: workspace.id, analysisId: analysis.id }}
                        >
                          {l("Öppna analysen", "Open the analysis")}
                        </Link>
                      </WorkButton>
                    ) : (
                      canEdit &&
                      row.status === "proposed" && (
                        <ProgrammeRiskEditor
                          key={row.version}
                          risk={row}
                          onSaved={() => void refresh()}
                        />
                      )
                    )}
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <WorkButton asChild variant="outline" className="min-h-10">
                          <Link
                            to="/security-work/$workspaceId/risks"
                            params={{ workspaceId: workspace.id }}
                            search={{ new: true, riskId: row.id }}
                            onClick={() => setCreating("action")}
                          >
                            {l("Ny åtgärd för risken", "New action for this risk")}
                          </Link>
                        </WorkButton>
                        {membership.can_approve && row.status !== "closed" && (
                          <WorkButton
                            variant="outline"
                            className="min-h-10"
                            onClick={() =>
                              setDecision(
                                decision?.id === row.id
                                  ? null
                                  : {
                                      id: row.id,
                                      status: row.status === "proposed" ? "accepted" : "closed",
                                      rationale: "",
                                    },
                              )
                            }
                          >
                            {row.status === "proposed"
                              ? l("Acceptera risken", "Accept the risk")
                              : l("Avsluta risken", "Close the risk")}
                          </WorkButton>
                        )}
                      </div>
                    )}
                    {decision?.id === row.id && (
                      <form
                        className="space-y-3 rounded-lg border border-border p-3"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const saved = await op.run(() =>
                            decide({
                              data: {
                                workspaceId: workspace.id,
                                id: row.id,
                                version: row.version,
                                status: decision.status,
                                decision_rationale: decision.rationale,
                              },
                            }),
                          );
                          if (saved) {
                            setDecision(null);
                            await refresh();
                          }
                        }}
                      >
                        <TextAreaField
                          label={l("Beslutsmotivering (krävs)", "Decision rationale (required)")}
                          required
                          value={decision.rationale}
                          maxLength={8000}
                          onChange={(e) => setDecision({ ...decision, rationale: e.target.value })}
                        />
                        {row.assessment_id && (
                          <p className="text-xs text-muted-foreground">
                            {l(
                              "En risk under en analys kan accepteras först när analysen är godkänd.",
                              "A risk under an analysis can be accepted only once the analysis is approved.",
                            )}
                          </p>
                        )}
                        <WorkError code={op.error} />
                        <div className="flex flex-wrap items-center gap-2">
                          <WorkButton type="submit" disabled={op.state === "saving"}>
                            {decision.status === "accepted"
                              ? l("Acceptera", "Accept")
                              : l("Avsluta", "Close")}
                          </WorkButton>
                          <SaveStatus state={op.state} />
                        </div>
                      </form>
                    )}
                    <ul className="text-sm">
                      {actions
                        .filter((action) => action.risk_id === row.id)
                        .map((action) => (
                          <li key={action.id} className="flex flex-wrap items-center gap-2 py-1">
                            {action.title} <WorkStatus status={action.status} />
                          </li>
                        ))}
                    </ul>
                    <EvidenceLinks
                      targetKind="risk"
                      targetId={row.id}
                      links={evidenceLinks}
                      onChanged={() => void refresh()}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <Explain title={lang === "sv" ? "Så bedöms risker" : "How risks are rated"}>
        <p>
          {l(
            "Sannolikhet och konsekvens (1–5) är din bedömning. Färgen beräknas av den fasta matrisen. Att acceptera eller avsluta en risk kräver godkännanderätt och en motivering, och stämplas av systemet – aldrig av AI.",
            "Likelihood and consequence (1–5) are your judgement. The colour is computed by the fixed matrix. Accepting or closing a risk requires the approver right and a rationale, and is stamped by the system, never by AI.",
          )}
        </p>
      </Explain>
    </>
  );
}
