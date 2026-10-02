import type { Json } from "@/integrations/supabase/types";
import { AnalysisFailure, checked } from "../analysis-services";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import { BASELINE_VERSION, baselineQuestions } from "./content/baseline-v1";
import { PLAN_90_VERSION } from "./content/plan-90-v1";
import type * as inputs from "./inputs";
import { MANAGEMENT_REPORT_VERSION, buildManagementReportData } from "./management-report";
import type {
  Action,
  AiSuggestion,
  BaselineAnswer,
  BaselineAssessment,
  EvidenceLink,
  Gap,
  ManagementReport,
  Mandate,
  ProgrammeFacts,
  ProgrammePlan,
  ProtectedAsset,
  Risk,
  RiskAssetLink,
} from "./types";

/** Service layer for the programme. Every read and write goes through the
 * caller's RLS client after the membership precheck the rest of Security
 * Work uses; input identifiers never confer access. Nothing here calls AI. */

const LIMIT = 501;
async function access(caller: SecurityWorkCaller, workspaceId: string, edit = false) {
  try {
    return await requireWorkspace(caller, workspaceId, edit);
  } catch (error) {
    throw new AnalysisFailure(
      error instanceof Error && "code" in error && error.code === "ACCESS_DENIED"
        ? "ACCESS_DENIED"
        : "SAVE_FAILED",
    );
  }
}
function bounded<T>(rows: T[] | null): T[] {
  const list = rows ?? [];
  if (list.length >= LIMIT) throw new AnalysisFailure("LIST_LIMIT");
  return list;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export type ProgrammeSnapshot = ProgrammeFacts & {
  evidenceLinks: EvidenceLink[];
  suggestions: AiSuggestion[];
  members: { user_id: string; role: string }[];
};

export async function readProgramme(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<ProgrammeSnapshot> {
  await access(caller, workspaceId);
  const db = caller.supabase;
  const [
    mandate,
    assets,
    riskAssets,
    risks,
    actions,
    gaps,
    baseline,
    answers,
    profile,
    requirements,
    pending,
    analyses,
    analysisReports,
    managementReports,
    plan,
    evidenceLinks,
    suggestions,
    members,
  ] = await Promise.all([
    db.from("sw_security_mandates").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    db.from("sw_protected_assets").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("created_at"),
    db.from("sw_risk_assets").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_risks").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("updated_at", { ascending: false }),
    db.from("sw_actions").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("updated_at", { ascending: false }),
    db.from("sw_gaps").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("created_at", { ascending: false }),
    db
      .from("sw_baseline_assessments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("sw_baseline_answers").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_monitoring_profiles").select("id").eq("workspace_id", workspaceId).maybeSingle(),
    db
      .from("sw_intelligence_requirements")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    db
      .from("sw_intelligence_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    db.from("sw_assessments").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_reports").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_management_reports").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("created_at", { ascending: false }),
    db.from("sw_programme_plans").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    db.from("sw_evidence_links").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_ai_suggestions").select("*").eq("workspace_id", workspaceId).limit(LIMIT).order("created_at", { ascending: false }),
    db
      .from("sw_workspace_memberships")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("active", true)
      .limit(200),
  ]);
  const current = checked(baseline);
  const answerRows = bounded(checked(answers)).filter(
    (row) => current && row.baseline_id === current.id,
  );
  await access(caller, workspaceId);
  return {
    today: today(),
    mandate: checked(mandate),
    assets: bounded(checked(assets)),
    riskAssets: bounded(checked(riskAssets)),
    risks: bounded(checked(risks)),
    actions: bounded(checked(actions)),
    gaps: bounded(checked(gaps)),
    baseline: { assessment: current, answers: answerRows },
    monitoring: {
      profileExists: Boolean(checked(profile)),
      requirements: requirements.count ?? 0,
      pendingItems: pending.count ?? 0,
    },
    analyses: bounded(checked(analyses)),
    analysisReports: bounded(checked(analysisReports)),
    managementReports: bounded(checked(managementReports)),
    plan: checked(plan),
    evidenceLinks: bounded(checked(evidenceLinks)),
    suggestions: bounded(checked(suggestions)),
    members: checked(members) ?? [],
  };
}

async function conflict(caller: SecurityWorkCaller, workspaceId: string): Promise<never> {
  await access(caller, workspaceId, true);
  throw new AnalysisFailure("CONFLICT");
}

// ── Mandate ──────────────────────────────────────────────────────────────────
export async function saveMandate(
  caller: SecurityWorkCaller,
  data: inputs.SaveMandateInput,
): Promise<Mandate> {
  await access(caller, data.workspaceId, true);
  const { workspaceId, version, ...fields } = data;
  const result =
    version === null
      ? await caller.supabase
          .from("sw_security_mandates")
          .insert({ ...fields, workspace_id: workspaceId })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_security_mandates")
          .update(fields)
          .eq("workspace_id", workspaceId)
          .eq("version", version)
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  return saved ?? conflict(caller, workspaceId);
}
export async function saveMandateDocument(
  caller: SecurityWorkCaller,
  data: inputs.SaveMandateDocumentInput,
): Promise<Mandate> {
  await access(caller, data.workspaceId, true);
  let provenance: Json = { origin: "user" };
  if (data.suggestionId) {
    // Only an APPROVED suggestion of the right kind may be named as the origin.
    const suggestion = checked(
      await caller.supabase
        .from("sw_ai_suggestions")
        .select("id,kind,status")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.suggestionId)
        .maybeSingle(),
    );
    if (!suggestion || suggestion.kind !== "mandate_draft" || suggestion.status !== "approved")
      throw new AnalysisFailure("INVALID_INPUT");
    provenance = { origin: "ai_suggestion", suggestion_id: data.suggestionId };
  }
  const saved = checked(
    await caller.supabase
      .from("sw_security_mandates")
      .update({ mandate_document: data.mandate_document, document_provenance: provenance })
      .eq("workspace_id", data.workspaceId)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  return saved ?? conflict(caller, data.workspaceId);
}

// ── Protected assets ─────────────────────────────────────────────────────────
export async function saveAsset(
  caller: SecurityWorkCaller,
  data: inputs.SaveAssetInput,
): Promise<ProtectedAsset> {
  await access(caller, data.workspaceId, true);
  const { workspaceId, id, version, ...fields } = data;
  const result =
    version === null
      ? await caller.supabase
          .from("sw_protected_assets")
          .insert({ ...fields, id, workspace_id: workspaceId })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_protected_assets")
          .update(fields)
          .eq("workspace_id", workspaceId)
          .eq("id", id)
          .eq("version", version)
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  return saved ?? conflict(caller, workspaceId);
}
export async function linkRiskAsset(
  caller: SecurityWorkCaller,
  data: inputs.LinkRiskAssetInput,
): Promise<RiskAssetLink[]> {
  await access(caller, data.workspaceId, true);
  if (data.linked) {
    const existing = checked(
      await caller.supabase
        .from("sw_risk_assets")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("risk_id", data.riskId)
        .eq("asset_id", data.assetId)
        .maybeSingle(),
    );
    if (!existing) {
      const inserted = await caller.supabase
        .from("sw_risk_assets")
        .insert({ workspace_id: data.workspaceId, risk_id: data.riskId, asset_id: data.assetId })
        .select("*")
        .single();
      if (inserted.error?.code !== "23505") checked(inserted);
    }
  } else {
    checked(
      await caller.supabase
        .from("sw_risk_assets")
        .delete()
        .eq("workspace_id", data.workspaceId)
        .eq("risk_id", data.riskId)
        .eq("asset_id", data.assetId),
    );
  }
  return bounded(
    checked(
      await caller.supabase
        .from("sw_risk_assets")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("risk_id", data.riskId)
        .limit(LIMIT),
    ),
  );
}

// ── Risks (programme and legacy) ─────────────────────────────────────────────
export async function saveProgrammeRisk(
  caller: SecurityWorkCaller,
  data: inputs.SaveProgrammeRiskInput,
): Promise<Risk> {
  await access(caller, data.workspaceId, true);
  const { workspaceId, id, version, assetIds, ...fields } = data;
  const result =
    version === null
      ? await caller.supabase
          .from("sw_risks")
          .insert({ ...fields, id, workspace_id: workspaceId, assessment_id: null, source_kind: "programme" })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_risks")
          .update(fields)
          .eq("workspace_id", workspaceId)
          .eq("id", id)
          .eq("version", version)
          .eq("status", "proposed")
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  if (!saved) return conflict(caller, workspaceId);
  const current = bounded(
    checked(
      await caller.supabase
        .from("sw_risk_assets")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("risk_id", id)
        .limit(LIMIT),
    ),
  );
  for (const link of current)
    if (!assetIds.includes(link.asset_id))
      checked(
        await caller.supabase
          .from("sw_risk_assets")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("id", link.id),
      );
  for (const assetId of assetIds)
    if (!current.some((link) => link.asset_id === assetId)) {
      const inserted = await caller.supabase
        .from("sw_risk_assets")
        .insert({ workspace_id: workspaceId, risk_id: id, asset_id: assetId });
      if (inserted.error?.code !== "23505") checked(inserted);
    }
  return saved;
}
/** Accepting or closing a risk is a human decision; the database stamps it
 * and requires the approver capability. Owner only changes while proposed. */
export async function decideRisk(
  caller: SecurityWorkCaller,
  data: inputs.DecideRiskInput,
): Promise<Risk> {
  await access(caller, data.workspaceId, true);
  const saved = checked(
    await caller.supabase
      .from("sw_risks")
      .update({ status: data.status, decision_rationale: data.decision_rationale })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  return saved ?? conflict(caller, data.workspaceId);
}

// ── Baseline ─────────────────────────────────────────────────────────────────
export async function startBaseline(
  caller: SecurityWorkCaller,
  data: inputs.StartBaselineInput,
): Promise<BaselineAssessment> {
  await access(caller, data.workspaceId, true);
  const open = checked(
    await caller.supabase
      .from("sw_baseline_assessments")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("status", "open")
      .maybeSingle(),
  );
  if (open) {
    if (open.mode === data.mode) return open;
    const widened = checked(
      await caller.supabase
        .from("sw_baseline_assessments")
        .update({ mode: data.mode })
        .eq("workspace_id", data.workspaceId)
        .eq("id", open.id)
        .eq("version", open.version)
        .select("*")
        .maybeSingle(),
    );
    return widened ?? conflict(caller, data.workspaceId);
  }
  const created = checked(
    await caller.supabase
      .from("sw_baseline_assessments")
      .insert({
        workspace_id: data.workspaceId,
        content_version: BASELINE_VERSION,
        market: data.market,
        mode: data.mode,
      })
      .select("*")
      .single(),
  );
  if (!created) throw new AnalysisFailure("SAVE_FAILED");
  return created;
}
export async function answerBaseline(
  caller: SecurityWorkCaller,
  data: inputs.AnswerBaselineInput,
): Promise<BaselineAnswer> {
  await access(caller, data.workspaceId, true);
  const assessment = checked(
    await caller.supabase
      .from("sw_baseline_assessments")
      .select("id,status,market,content_version")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.baselineId)
      .maybeSingle(),
  );
  if (!assessment || assessment.status !== "open") throw new AnalysisFailure("CONFLICT");
  if (
    assessment.content_version !== BASELINE_VERSION ||
    !baselineQuestions(assessment.market as "global" | "se").some(
      (question) => question.id === data.questionId,
    )
  )
    throw new AnalysisFailure("INVALID_INPUT");
  const existing = checked(
    await caller.supabase
      .from("sw_baseline_answers")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("baseline_id", data.baselineId)
      .eq("question_id", data.questionId)
      .maybeSingle(),
  );
  const result = existing
    ? await caller.supabase
        .from("sw_baseline_answers")
        .update({ answer: data.answer, note: data.note })
        .eq("workspace_id", data.workspaceId)
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select("*")
        .maybeSingle()
    : await caller.supabase
        .from("sw_baseline_answers")
        .insert({
          workspace_id: data.workspaceId,
          baseline_id: data.baselineId,
          question_id: data.questionId,
          answer: data.answer,
          note: data.note,
        })
        .select("*")
        .single();
  const saved = checked(result);
  return saved ?? conflict(caller, data.workspaceId);
}
export async function completeBaseline(
  caller: SecurityWorkCaller,
  data: inputs.CompleteBaselineInput,
): Promise<BaselineAssessment> {
  await access(caller, data.workspaceId, true);
  const saved = checked(
    await caller.supabase
      .from("sw_baseline_assessments")
      .update({ status: "completed", mode: data.mode })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.baselineId)
      .eq("version", data.version)
      .eq("status", "open")
      .select("*")
      .maybeSingle(),
  );
  return saved ?? conflict(caller, data.workspaceId);
}

// ── Gaps ─────────────────────────────────────────────────────────────────────
export async function saveGap(caller: SecurityWorkCaller, data: inputs.SaveGapInput): Promise<Gap> {
  await access(caller, data.workspaceId, true);
  const { workspaceId, id, version, baselineId, baselineQuestionId, ...fields } = data;
  const result =
    version === null
      ? await caller.supabase
          .from("sw_gaps")
          .insert({
            ...fields,
            id,
            workspace_id: workspaceId,
            baseline_id: baselineId,
            baseline_question_id: baselineQuestionId,
          })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_gaps")
          .update(fields)
          .eq("workspace_id", workspaceId)
          .eq("id", id)
          .eq("version", version)
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  return saved ?? conflict(caller, workspaceId);
}

// ── Actions (one editor for every source) ────────────────────────────────────
export async function saveProgrammeAction(
  caller: SecurityWorkCaller,
  data: inputs.SaveProgrammeActionInput,
): Promise<Action> {
  await access(caller, data.workspaceId, true);
  const values = {
    title: data.title,
    description: data.description,
    assignee_user_id: data.assigneeUserId,
    due_date: data.dueDate,
    priority: data.priority,
    status: data.status,
    decision_rationale: data.rationale,
    completion_evidence: data.completionEvidence,
    approval_required: data.approval_required,
    approval_note: data.approval_note,
    gap_id: data.gapId,
    asset_id: data.assetId,
    source_kind: data.source_kind,
  };
  const result =
    data.version === null
      ? await caller.supabase
          .from("sw_actions")
          .insert({
            ...values,
            id: data.id,
            workspace_id: data.workspaceId,
            assessment_id: data.assessmentId,
            risk_id: data.riskId,
          })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_actions")
          .update(values)
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.id)
          .eq("version", data.version)
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  return saved ?? conflict(caller, data.workspaceId);
}

// ── Evidence links ───────────────────────────────────────────────────────────
export async function linkEvidence(
  caller: SecurityWorkCaller,
  data: inputs.EvidenceLinkInput,
): Promise<EvidenceLink[]> {
  await access(caller, data.workspaceId, true);
  if (data.linked) {
    const inserted = await caller.supabase.from("sw_evidence_links").insert({
      workspace_id: data.workspaceId,
      source_id: data.sourceId,
      target_kind: data.targetKind,
      target_id: data.targetId,
      note: data.note,
    });
    if (inserted.error?.code !== "23505") checked(inserted);
  } else {
    checked(
      await caller.supabase
        .from("sw_evidence_links")
        .delete()
        .eq("workspace_id", data.workspaceId)
        .eq("source_id", data.sourceId)
        .eq("target_kind", data.targetKind)
        .eq("target_id", data.targetId),
    );
  }
  return bounded(
    checked(
      await caller.supabase
        .from("sw_evidence_links")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("target_kind", data.targetKind)
        .eq("target_id", data.targetId)
        .limit(LIMIT),
    ),
  );
}

// ── 90-day plan ──────────────────────────────────────────────────────────────
export async function savePlan(caller: SecurityWorkCaller, data: inputs.PlanInput): Promise<ProgrammePlan> {
  await access(caller, data.workspaceId, true);
  const result =
    data.version === null
      ? await caller.supabase
          .from("sw_programme_plans")
          .insert({
            workspace_id: data.workspaceId,
            checklist_version: PLAN_90_VERSION,
            status: data.status,
            completed_task_ids: data.completedTaskIds,
          })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_programme_plans")
          .update({ status: data.status, completed_task_ids: data.completedTaskIds })
          .eq("workspace_id", data.workspaceId)
          .eq("version", data.version)
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  return saved ?? conflict(caller, data.workspaceId);
}

// ── Management reports ───────────────────────────────────────────────────────
async function latestApprovedReport(
  caller: SecurityWorkCaller,
  workspaceId: string,
  excludeId: string,
): Promise<ManagementReport | null> {
  return checked(
    await caller.supabase
      .from("sw_management_reports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "approved")
      .neq("id", excludeId)
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}
export async function createManagementReport(
  caller: SecurityWorkCaller,
  data: inputs.CreateManagementReportInput,
): Promise<ManagementReport> {
  await access(caller, data.workspaceId, true);
  const snapshot = await readProgramme(caller, data.workspaceId);
  const previous = await latestApprovedReport(caller, data.workspaceId, data.id);
  const built = buildManagementReportData(snapshot, previous);
  const created = checked(
    await caller.supabase
      .from("sw_management_reports")
      .insert({
        id: data.id,
        workspace_id: data.workspaceId,
        title: data.title,
        language: data.language,
        content_version: MANAGEMENT_REPORT_VERSION,
        period_start: data.period_start,
        period_end: data.period_end,
        facts: built.facts as unknown as Json,
        computed: built.computed as unknown as Json,
      })
      .select("*")
      .single(),
  );
  if (!created) throw new AnalysisFailure("SAVE_FAILED");
  return created;
}
export async function saveManagementReport(
  caller: SecurityWorkCaller,
  data: inputs.SaveManagementReportInput,
): Promise<ManagementReport> {
  await access(caller, data.workspaceId, true);
  // AI-origin sections must name an approved report_narrative suggestion.
  const aiSections = Object.values(data.narrative).filter((section) => section.origin === "ai");
  if (aiSections.length) {
    const ids = [...new Set(aiSections.map((section) => section.suggestion_id ?? ""))];
    if (ids.some((id) => !id)) throw new AnalysisFailure("INVALID_INPUT");
    const approved = bounded(
      checked(
        await caller.supabase
          .from("sw_ai_suggestions")
          .select("id")
          .eq("workspace_id", data.workspaceId)
          .eq("kind", "report_narrative")
          .eq("status", "approved")
          .in("id", ids)
          .limit(LIMIT),
      ),
    );
    if (approved.length !== ids.length) throw new AnalysisFailure("INVALID_INPUT");
  }
  let refreshed: { facts: Json; computed: Json } | null = null;
  if (data.refreshData) {
    const snapshot = await readProgramme(caller, data.workspaceId);
    const previous = await latestApprovedReport(caller, data.workspaceId, data.id);
    const built = buildManagementReportData(snapshot, previous);
    refreshed = { facts: built.facts as unknown as Json, computed: built.computed as unknown as Json };
  }
  const saved = checked(
    await caller.supabase
      .from("sw_management_reports")
      .update({
        title: data.title,
        narrative: data.narrative as unknown as Json,
        decisions_required: data.decisions_required as unknown as Json,
        ...(refreshed ?? {}),
      })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("version", data.version)
      .eq("status", "draft")
      .select("*")
      .maybeSingle(),
  );
  return saved ?? conflict(caller, data.workspaceId);
}
export async function decideManagementReport(
  caller: SecurityWorkCaller,
  data: inputs.DecideManagementReportInput,
): Promise<ManagementReport> {
  await access(caller, data.workspaceId, true);
  const saved = checked(
    await caller.supabase
      .from("sw_management_reports")
      .update({ status: data.status })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("version", data.version)
      .select("*")
      .maybeSingle(),
  );
  return saved ?? conflict(caller, data.workspaceId);
}
