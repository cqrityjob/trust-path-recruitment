import type { Json } from "@/integrations/supabase/types";
import { requireWorkspace, type SecurityWorkCaller } from "./services";
import {
  analysisMethods,
  reportSections,
  type AnalysisSaveInput,
  type ReportSaveInput,
} from "./analysis-model";
import type { Analysis, AnalysisDetail, Portfolio, Report } from "./analysis-types";
import { originalQuestionBasis } from "./question-provenance";

export class AnalysisFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function analysisResult<T>(operation: () => Promise<T>) {
  try {
    return { ok: true as const, data: await operation() };
  } catch (error) {
    const permissionError =
      error instanceof Error && "code" in error && error.code === "ACCESS_DENIED";
    return {
      ok: false as const,
      code: permissionError
        ? "ACCESS_DENIED"
        : error instanceof AnalysisFailure
          ? error.code
          : "SAVE_FAILED",
    };
  }
}
export function checked<T>(result: {
  data: T;
  error: { code?: string; message?: string } | null;
}): T {
  if (result.error) {
    const code = result.error.code;
    throw new AnalysisFailure(
      code === "42501"
        ? "ACCESS_DENIED"
        : code === "PT409" || code === "40001" || code === "23505"
          ? "CONFLICT"
          : code === "23514" || code === "22023"
            ? "INVALID_INPUT"
            : "SAVE_FAILED",
    );
  }
  return result.data;
}
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
export async function portfolio(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<Portfolio> {
  await access(caller, workspaceId);
  const [a, r, t, p, d] = await Promise.all([
    caller.supabase
      .from("sw_assessments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(501),
    caller.supabase
      .from("sw_risks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(501),
    caller.supabase
      .from("sw_actions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(501),
    caller.supabase
      .from("sw_reports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(501),
    caller.supabase
      .from("sw_documents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(501),
  ]);
  const result = {
    analyses: checked(a) ?? [],
    risks: checked(r) ?? [],
    actions: checked(t) ?? [],
    reports: checked(p) ?? [],
    documents: checked(d) ?? [],
  };
  if (Object.values(result).some((rows) => rows.length > 500))
    throw new AnalysisFailure("LIST_LIMIT");
  await access(caller, workspaceId);
  return result;
}
export async function readAnalysis(
  caller: SecurityWorkCaller,
  workspaceId: string,
  id: string,
): Promise<AnalysisDetail> {
  await access(caller, workspaceId);
  const analysis = checked(
    await caller.supabase
      .from("sw_assessments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!analysis) throw new AnalysisFailure("ACCESS_DENIED");
  const [i, q, r, a, p, j, c, applied] = await Promise.all([
    caller.supabase
      .from("sw_analysis_inputs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .limit(501),
    caller.supabase
      .from("sw_analysis_questions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .order("position")
      .limit(101),
    caller.supabase
      .from("sw_risks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .limit(201),
    caller.supabase
      .from("sw_actions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .limit(201),
    caller.supabase
      .from("sw_reports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .order("created_at", { ascending: false })
      .limit(101),
    caller.supabase
      .from("sw_processing_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .order("created_at", { ascending: false })
      .limit(101),
    caller.supabase
      .from("sw_citations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .limit(501),
    caller.supabase
      .from("sw_ai_draft_applications")
      .select("workspace_id,assessment_id,job_id,question_ids")
      .eq("workspace_id", workspaceId)
      .eq("assessment_id", id)
      .limit(101),
  ]);
  const applications = checked(applied) ?? [];
  const inputs = checked(i) ?? [];
  const sourceItems = inputs.length
    ? (checked(
        await caller.supabase
          .from("sw_source_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .in(
            "id",
            inputs.map((row) => row.source_item_id),
          ),
      ) ?? [])
    : [];
  const result = {
    analysis,
    inputs,
    sourceItems,
    questions: checked(q) ?? [],
    risks: checked(r) ?? [],
    actions: checked(a) ?? [],
    reports: checked(p) ?? [],
    jobs: checked(j) ?? [],
    citations: checked(c) ?? [],
    questionBasis: {},
  };
  if (
    inputs.length > 500 ||
    result.questions.length > 100 ||
    result.risks.length > 200 ||
    result.actions.length > 200 ||
    result.reports.length > 100 ||
    result.jobs.length > 100 ||
    result.citations.length > 500 ||
    applications.length > 100
  )
    throw new AnalysisFailure("LIST_LIMIT");
  result.questionBasis = originalQuestionBasis(
    workspaceId,
    id,
    result.questions.map((row) => row.id),
    result.jobs,
    applications,
    sourceItems,
  );
  await access(caller, workspaceId);
  return result;
}
export async function saveAnalysis(
  caller: SecurityWorkCaller,
  data: AnalysisSaveInput,
): Promise<Analysis> {
  await access(caller, data.workspaceId, true);
  const { workspaceId, version, ...fields } = data;
  const values = { ...fields, method_version_id: analysisMethods[data.analysis_type].method };
  const result =
    version === null
      ? await caller.supabase
          .from("sw_assessments")
          .insert({ ...values, workspace_id: workspaceId })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_assessments")
          .update(values)
          .eq("workspace_id", workspaceId)
          .eq("id", data.id)
          .eq("version", version)
          .eq("status", "draft")
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  await access(caller, workspaceId, true);
  if (!saved) throw new AnalysisFailure("CONFLICT");
  return saved;
}
export async function saveReport(
  caller: SecurityWorkCaller,
  data: ReportSaveInput,
): Promise<Report> {
  await access(caller, data.workspaceId, true);
  const assessment = checked(
    await caller.supabase
      .from("sw_assessments")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.assessmentId)
      .maybeSingle(),
  );
  if (!assessment) throw new AnalysisFailure("ACCESS_DENIED");
  const type = assessment.analysis_type as keyof typeof analysisMethods;
  const allowed = reportSections[type].map((section) => section[0]);
  if (Object.keys(data.sections).some((key) => !allowed.includes(key as never)))
    throw new AnalysisFailure("INVALID_INPUT");
  const values = {
    title: data.title,
    language: data.language,
    sections: data.sections,
    uncertainty: data.uncertainty,
    template_version_id: analysisMethods[type].template,
    report_type: analysisMethods[type].reportType,
    ...(type === "legacy_security" ? data.sections : {}),
  };
  const result =
    data.version === null
      ? await caller.supabase
          .from("sw_reports")
          .insert({
            ...values,
            id: data.id,
            workspace_id: data.workspaceId,
            assessment_id: data.assessmentId,
          })
          .select("*")
          .single()
      : await caller.supabase
          .from("sw_reports")
          .update(values)
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.id)
          .eq("assessment_id", data.assessmentId)
          .eq("version", data.version)
          .eq("status", "draft")
          .select("*")
          .maybeSingle();
  const saved = checked(result);
  await access(caller, data.workspaceId, true);
  if (!saved) throw new AnalysisFailure("CONFLICT");
  return saved;
}
