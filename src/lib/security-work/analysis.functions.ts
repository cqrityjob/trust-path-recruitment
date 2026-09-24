import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireWorkspace } from "./services";
import { analysisSaveInput, reportSaveInput } from "./analysis-model";
import {
  analysisResult,
  AnalysisFailure,
  checked,
  portfolio,
  readAnalysis,
  saveAnalysis,
  saveReport,
} from "./analysis-services";

const scope = z.object({ workspaceId: z.string().uuid() }).strict();
const record = scope.extend({ id: z.string().uuid() });
const versioned = record.extend({ version: z.number().int().positive() });
export const applyWorkAiDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    scope.extend({
      jobId: z.string().uuid(),
      version: z.number().int().positive(),
      requestId: z.string().uuid(),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () =>
      checked(
        await context.supabase.rpc("sw_apply_ai_draft", {
          _workspace_id: data.workspaceId,
          _job_id: data.jobId,
          _expected_version: data.version,
          _request_id: data.requestId,
        }),
      ),
    ),
  );
export const getWorkPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scope)
  .handler(({ context, data }) => analysisResult(() => portfolio(context, data.workspaceId)));
export const getWorkAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(record)
  .handler(({ context, data }) =>
    analysisResult(() => readAnalysis(context, data.workspaceId, data.id)),
  );
export const saveWorkAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(analysisSaveInput)
  .handler(({ context, data }) => analysisResult(() => saveAnalysis(context, data)));
export const saveWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(reportSaveInput)
  .handler(({ context, data }) => analysisResult(() => saveReport(context, data)));
export const getWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(record)
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId);
      const report = checked(
        await context.supabase
          .from("sw_reports")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.id)
          .maybeSingle(),
      );
      if (!report) throw new AnalysisFailure("ACCESS_DENIED");
      const detail = await readAnalysis(context, data.workspaceId, report.assessment_id);
      const approval = checked(
        await context.supabase
          .from("sw_report_approvals")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .eq("report_id", data.id)
          .maybeSingle(),
      );
      const citations =
        checked(
          await context.supabase
            .from("sw_citations")
            .select("*")
            .eq("workspace_id", data.workspaceId)
            .eq("report_id", data.id)
            .limit(501),
        ) ?? [];
      if (citations.length > 500) throw new AnalysisFailure("LIST_LIMIT");
      await requireWorkspace(context, data.workspaceId);
      return { report, detail, approval, citations };
    }),
  );
export const previewWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(versioned)
  .handler(({ context, data }) =>
    analysisResult(async () =>
      checked(
        await context.supabase.rpc("sw_preview_report", {
          _workspace_id: data.workspaceId,
          _report_id: data.id,
        }),
      ),
    ),
  );
export const approveWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(versioned.extend({ bundleHash: z.string().regex(/^[a-f0-9]{64}$/) }))
  .handler(({ context, data }) =>
    analysisResult(async () =>
      checked(
        await context.supabase.rpc("sw_approve_report", {
          _workspace_id: data.workspaceId,
          _report_id: data.id,
          _expected_version: data.version,
          _expected_bundle_hash: data.bundleHash,
        }),
      ),
    ),
  );
export const reviseWorkAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(versioned.extend({ requestId: z.string().uuid() }))
  .handler(({ context, data }) =>
    analysisResult(async () =>
      checked(
        await context.supabase.rpc("sw_revise_analysis", {
          _workspace_id: data.workspaceId,
          _assessment_id: data.id,
          _expected_version: data.version,
          _request_id: data.requestId,
        }),
      ),
    ),
  );

export const saveWorkInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    record.extend({
      assessmentId: z.string().uuid(),
      sourceItemId: z.string().uuid(),
      version: z.number().int().positive().nullable(),
      reviewStatus: z.enum(["pending", "accepted", "rejected"]),
      reviewNote: z.string().max(4000),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const values = { review_status: data.reviewStatus, review_note: data.reviewNote };
      const result =
        data.version === null
          ? await context.supabase
              .from("sw_analysis_inputs")
              .insert({
                ...values,
                id: data.id,
                workspace_id: data.workspaceId,
                assessment_id: data.assessmentId,
                source_item_id: data.sourceItemId,
              })
              .select("*")
              .single()
          : await context.supabase
              .from("sw_analysis_inputs")
              .update(values)
              .eq("workspace_id", data.workspaceId)
              .eq("assessment_id", data.assessmentId)
              .eq("source_item_id", data.sourceItemId)
              .eq("id", data.id)
              .eq("version", data.version)
              .select("*")
              .maybeSingle();
      const row = checked(result);
      if (!row) {
        await requireWorkspace(context, data.workspaceId, true);
        throw new AnalysisFailure("CONFLICT");
      }
      return row;
    }),
  );
export const saveWorkCitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    record.extend({
      targetId: z.string().uuid(),
      targetType: z.enum(["assessment", "report", "risk"]),
      sourceItemId: z.string().uuid(),
      claim: z.string().trim().min(1).max(4000),
      excerpt: z.string().min(1).max(8000),
      locator: z.string().max(500),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const source = checked(
        await context.supabase
          .from("sw_source_items")
          .select("factual_extract")
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.sourceItemId)
          .maybeSingle(),
      );
      if (!source) throw new AnalysisFailure("ACCESS_DENIED");
      if (!source.factual_extract.includes(data.excerpt))
        throw new AnalysisFailure("INVALID_CITATION");
      const segment = checked(
        await context.supabase
          .from("sw_extraction_segments")
          .select("locator")
          .eq("workspace_id", data.workspaceId)
          .eq("source_item_id", data.sourceItemId)
          .maybeSingle(),
      );
      const values = {
        id: data.id,
        workspace_id: data.workspaceId,
        source_item_id: data.sourceItemId,
        claim: data.claim,
        excerpt: data.excerpt,
        locator: segment?.locator ?? data.locator,
        assessment_id: data.targetType === "assessment" ? data.targetId : null,
        report_id: data.targetType === "report" ? data.targetId : null,
        risk_id: data.targetType === "risk" ? data.targetId : null,
      };
      const existing = checked(
        await context.supabase
          .from("sw_citations")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .eq("id", data.id)
          .maybeSingle(),
      );
      if (existing) {
        if (
          Object.entries(values).some(
            ([key, value]) => existing[key as keyof typeof existing] !== value,
          )
        )
          throw new AnalysisFailure("CONFLICT");
        return existing;
      }
      return checked(
        await context.supabase.from("sw_citations").insert(values).select("*").single(),
      );
    }),
  );
export const exportWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(record.extend({ approvalId: z.string().uuid(), requestId: z.string().uuid() }))
  .handler(({ context, data }) =>
    analysisResult(async () =>
      checked(
        await context.supabase.rpc("sw_export_report", {
          _workspace_id: data.workspaceId,
          _report_id: data.id,
          _approval_id: data.approvalId,
          _request_id: data.requestId,
        }),
      ),
    ),
  );
export const saveWorkQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    record.extend({
      assessmentId: z.string().uuid(),
      version: z.number().int().positive().nullable(),
      question: z.string().trim().min(1).max(4000),
      answer: z.string().max(8000),
      evidenceKind: z.enum(["user_input", "assumption"]),
      position: z.number().int().min(0).max(100),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const values = {
        question: data.question,
        answer: data.answer,
        evidence_kind: data.evidenceKind,
        position: data.position,
      };
      const result =
        data.version === null
          ? await context.supabase
              .from("sw_analysis_questions")
              .insert({
                ...values,
                id: data.id,
                workspace_id: data.workspaceId,
                assessment_id: data.assessmentId,
              })
              .select("*")
              .single()
          : await context.supabase
              .from("sw_analysis_questions")
              .update(values)
              .eq("workspace_id", data.workspaceId)
              .eq("assessment_id", data.assessmentId)
              .eq("id", data.id)
              .eq("version", data.version)
              .select("*")
              .maybeSingle();
      const row = checked(result);
      if (!row) {
        await requireWorkspace(context, data.workspaceId, true);
        throw new AnalysisFailure("CONFLICT");
      }
      return row;
    }),
  );
export const saveWorkRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    record.extend({
      assessmentId: z.string().uuid(),
      version: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(500),
      description: z.string().max(16000),
      likelihood: z.number().int().min(1).max(5).nullable(),
      consequence: z.number().int().min(1).max(5).nullable(),
      uncertainty: z.string().max(8000),
      rationale: z.string().max(8000),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const values = {
        title: data.title,
        description: data.description,
        likelihood: data.likelihood,
        consequence: data.consequence,
        uncertainty: data.uncertainty,
        decision_rationale: data.rationale,
      };
      const result =
        data.version === null
          ? await context.supabase
              .from("sw_risks")
              .insert({
                ...values,
                id: data.id,
                workspace_id: data.workspaceId,
                assessment_id: data.assessmentId,
              })
              .select("*")
              .single()
          : await context.supabase
              .from("sw_risks")
              .update(values)
              .eq("workspace_id", data.workspaceId)
              .eq("assessment_id", data.assessmentId)
              .eq("id", data.id)
              .eq("version", data.version)
              .eq("status", "proposed")
              .select("*")
              .maybeSingle();
      const row = checked(result);
      if (!row) {
        await requireWorkspace(context, data.workspaceId, true);
        throw new AnalysisFailure("CONFLICT");
      }
      return row;
    }),
  );
export const saveWorkAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    record.extend({
      assessmentId: z.string().uuid(),
      riskId: z.string().uuid().nullable(),
      version: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(500),
      description: z.string().max(16000),
      assigneeUserId: z.string().uuid().nullable(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]),
      rationale: z.string().max(8000),
      completionEvidence: z.string().max(8000),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      await requireWorkspace(context, data.workspaceId, true);
      const values = {
        title: data.title,
        description: data.description,
        risk_id: data.riskId,
        assignee_user_id: data.assigneeUserId,
        due_date: data.dueDate,
        priority: data.priority,
        status: data.status,
        decision_rationale: data.rationale,
        completion_evidence: data.completionEvidence,
      };
      const result =
        data.version === null
          ? await context.supabase
              .from("sw_actions")
              .insert({
                ...values,
                id: data.id,
                workspace_id: data.workspaceId,
                assessment_id: data.assessmentId,
              })
              .select("*")
              .single()
          : await context.supabase
              .from("sw_actions")
              .update(values)
              .eq("workspace_id", data.workspaceId)
              .eq("assessment_id", data.assessmentId)
              .eq("id", data.id)
              .eq("version", data.version)
              .select("*")
              .maybeSingle();
      const row = checked(result);
      if (!row) {
        await requireWorkspace(context, data.workspaceId, true);
        throw new AnalysisFailure("CONFLICT");
      }
      return row;
    }),
  );
