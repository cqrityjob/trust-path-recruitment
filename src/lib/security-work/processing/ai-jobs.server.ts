import "@tanstack/react-start/server-only";
import { z } from "zod";
import { AnalysisFailure, checked } from "../analysis-services";
import type { ProcessingJob } from "../analysis-types";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import { assertWorkerSigningConfigured, signProcessingReceipt } from "./attestation.server";
import {
  resolveSwAiConfiguration,
  dispatchSwAiOnce,
  SwAiError,
  type SwAiConfiguration,
} from "./ai.server";
import { activationFromRow, analysisInputFromJob } from "./job-input.server";

type Env = Readonly<Record<string, string | undefined>>;
export type WorkAiStatus = { enabled: boolean; reason: string | null };

function configurationReason(env: Env): string | null {
  if (env.SW_AI_ENABLED !== "true") return "AI_NOT_ENABLED";
  if (
    env.SW_AI_PROVIDER !== "anthropic" ||
    !env.SW_AI_MODEL ||
    !env.SW_AI_ENVIRONMENT ||
    !env.SW_ANTHROPIC_API_KEY?.trim()
  )
    return "AI_NOT_CONFIGURED";
  try {
    assertWorkerSigningConfigured(env);
  } catch {
    return "PROCESSING_NOT_CONFIGURED";
  }
  return null;
}
async function loadConfiguration(
  caller: SecurityWorkCaller,
  workspaceId: string,
  env: Env,
): Promise<SwAiConfiguration> {
  const reason = configurationReason(env);
  if (reason) throw new AnalysisFailure(reason);
  const rows =
    checked(
      await caller.supabase
        .from("sw_ai_activations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("purpose", "draft_analysis")
        .eq("provider", env.SW_AI_PROVIDER!)
        .eq("model", env.SW_AI_MODEL!)
        .eq("environment", env.SW_AI_ENVIRONMENT!)
        .gt("valid_until", new Date().toISOString())
        .order("approved_at", { ascending: false })
        .limit(21),
    ) ?? [];
  if (!rows.length) throw new AnalysisFailure("AI_APPROVAL_REQUIRED");
  if (rows.length > 20) throw new AnalysisFailure("AI_APPROVAL_AMBIGUOUS");
  const revoked =
    checked(
      await caller.supabase
        .from("sw_ai_activation_revocations")
        .select("activation_id")
        .in(
          "activation_id",
          rows.map((row) => row.id),
        ),
    ) ?? [];
  const candidates: SwAiConfiguration[] = [];
  for (const row of rows) {
    if (revoked.some((revocation) => revocation.activation_id === row.id)) continue;
    try {
      candidates.push(resolveSwAiConfiguration(env, activationFromRow(row, workspaceId)));
    } catch (error) {
      if (!(error instanceof SwAiError)) throw error;
    }
  }
  if (candidates.length !== 1)
    throw new AnalysisFailure(candidates.length ? "AI_APPROVAL_AMBIGUOUS" : "AI_APPROVAL_REQUIRED");
  return candidates[0];
}

export async function workAiStatus(
  caller: SecurityWorkCaller,
  workspaceId: string,
  env: Env = process.env,
): Promise<WorkAiStatus> {
  await requireWorkspace(caller, workspaceId);
  let result: WorkAiStatus = { enabled: true, reason: null };
  try {
    await loadConfiguration(caller, workspaceId, env);
  } catch (error) {
    if (
      !(error instanceof AnalysisFailure) ||
      ![
        "AI_NOT_ENABLED",
        "AI_NOT_CONFIGURED",
        "PROCESSING_NOT_CONFIGURED",
        "AI_APPROVAL_REQUIRED",
        "AI_APPROVAL_AMBIGUOUS",
      ].includes(error.code)
    )
      throw error;
    result = { enabled: false, reason: error.code };
  }
  await requireWorkspace(caller, workspaceId);
  return result;
}

export interface WorkAiRequest {
  workspaceId: string;
  assessmentId: string;
  version: number;
  requestId: string;
}
async function requireCurrent(caller: SecurityWorkCaller, data: WorkAiRequest) {
  const assessment = checked(
    await caller.supabase
      .from("sw_assessments")
      .select("version,status")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.assessmentId)
      .maybeSingle(),
  );
  if (!assessment) throw new AnalysisFailure("ACCESS_DENIED");
  if (assessment.version !== data.version || !["draft", "in_review"].includes(assessment.status))
    throw new AnalysisFailure("CONFLICT");
}
function assertRequestIdentity(
  job: ProcessingJob,
  caller: SecurityWorkCaller,
  data: WorkAiRequest,
  requireRequestedId = true,
) {
  if (
    (requireRequestedId && job.id !== data.requestId) ||
    job.workspace_id !== data.workspaceId ||
    job.created_by !== caller.userId ||
    job.kind !== "ai" ||
    job.assessment_id !== data.assessmentId ||
    job.expected_version !== data.version ||
    job.document_id !== null ||
    !job.activation_id
  )
    throw new AnalysisFailure("CONFLICT");
}

async function recheckBeforeDispatch(
  caller: SecurityWorkCaller,
  data: WorkAiRequest,
  job: ProcessingJob,
  configuration: SwAiConfiguration,
  env: Env,
  signal: AbortSignal,
): Promise<void> {
  try {
    signal.throwIfAborted();
    await requireWorkspace(caller, data.workspaceId, true);
    await requireCurrent(caller, data);
    const current = await loadConfiguration(caller, data.workspaceId, env);
    if (JSON.stringify(current.activation) !== JSON.stringify(configuration.activation))
      throw new AnalysisFailure("CONFLICT");
    const snapshot = z
      .object({
        sources: z
          .array(
            z.object({
              sourceItemId: z.string().uuid(),
              reviewVersion: z.number().int().positive(),
            }),
          )
          .max(200),
        questions: z
          .array(z.object({ id: z.string().uuid(), version: z.number().int().positive() }))
          .max(100),
      })
      .parse(job.input_manifest);
    const [inputResult, questionResult] = await Promise.all([
      caller.supabase
        .from("sw_analysis_inputs")
        .select("source_item_id,review_status,version")
        .eq("workspace_id", data.workspaceId)
        .eq("assessment_id", data.assessmentId)
        .limit(501)
        .abortSignal(signal),
      caller.supabase
        .from("sw_analysis_questions")
        .select("id,version")
        .eq("workspace_id", data.workspaceId)
        .eq("assessment_id", data.assessmentId)
        .limit(101)
        .abortSignal(signal),
    ]);
    const inputs = checked(inputResult) ?? [];
    const questions = checked(questionResult) ?? [];
    const accepted = inputs.filter((input) => input.review_status === "accepted");
    if (
      inputs.length > 500 ||
      inputs.some((input) => input.review_status === "pending") ||
      accepted.length !== snapshot.sources.length ||
      snapshot.sources.some(
        (source) =>
          !accepted.some(
            (input) =>
              input.source_item_id === source.sourceItemId &&
              input.version === source.reviewVersion,
          ),
      ) ||
      questions.length !== snapshot.questions.length ||
      snapshot.questions.some(
        (question) =>
          !questions.some(
            (current) => current.id === question.id && current.version === question.version,
          ),
      )
    )
      throw new AnalysisFailure("CONFLICT");
    await requireWorkspace(caller, data.workspaceId, true);
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof SwAiError) throw error;
    throw new SwAiError("authorization_not_confirmed");
  }
}

/** No business row is changed here: the signed completion stores a reviewable proposal only. */
export async function requestAiDraft(
  caller: SecurityWorkCaller,
  data: WorkAiRequest,
  options: { env?: Env; dispatch?: typeof dispatchSwAiOnce } = {},
): Promise<ProcessingJob> {
  const env = options.env ?? process.env;
  await requireWorkspace(caller, data.workspaceId, true);
  await requireCurrent(caller, data);
  let job = checked(
    await caller.supabase
      .from("sw_processing_jobs")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.requestId)
      .maybeSingle(),
  );
  if (job) {
    assertRequestIdentity(job, caller, data);
    // Includes dispatched/outcome_unknown: a lost acknowledgement is not permission
    // to send again. Cached results remain readable if an activation later expires.
    if (job.status !== "reserved") {
      await requireWorkspace(caller, data.workspaceId, true);
      return job;
    }
  }
  const configuration = await loadConfiguration(caller, data.workspaceId, env);
  if (job && job.activation_id !== configuration.activation.id)
    throw new AnalysisFailure("CONFLICT");
  if (!job)
    job = checked(
      await caller.supabase.rpc("sw_reserve_processing", {
        _workspace_id: data.workspaceId,
        _request_id: data.requestId,
        _kind: "ai",
        _assessment_id: data.assessmentId,
        _expected_version: data.version,
        _activation_id: configuration.activation.id,
      }),
    );
  if (!job) throw new AnalysisFailure("SAVE_FAILED");
  // The database may deduplicate identical immutable input to an older job ID.
  // Its canonical ID is authoritative; actor, target, version and activation remain pinned.
  assertRequestIdentity(job, caller, data, false);
  if (job.activation_id !== configuration.activation.id) throw new AnalysisFailure("CONFLICT");
  if (job.status !== "reserved") {
    await requireWorkspace(caller, data.workspaceId, true);
    await requireCurrent(caller, data);
    return job;
  }
  const workspace = checked(
    await caller.supabase
      .from("sw_workspaces")
      .select("language")
      .eq("id", data.workspaceId)
      .single(),
  );
  if (!workspace || !["sv", "en"].includes(workspace.language))
    throw new AnalysisFailure("INVALID_INPUT");
  let prepared: ReturnType<typeof analysisInputFromJob>;
  try {
    prepared = analysisInputFromJob(
      job.input_manifest,
      { ...data, activationId: configuration.activation.id },
      workspace.language as "sv" | "en",
    );
  } catch (error) {
    if (error instanceof SwAiError) throw new AnalysisFailure("AI_INPUT_INVALID");
    throw error;
  }
  if (JSON.stringify(prepared.activation) !== JSON.stringify(configuration.activation))
    throw new AnalysisFailure("CONFLICT");
  const claim = checked(
    await caller.supabase.rpc("sw_dispatch_processing", {
      _workspace_id: data.workspaceId,
      _job_id: job.id,
    }),
  );
  const envelope = z
    .object({
      dispatch: z.boolean(),
      job: z.object({ id: z.string().uuid(), fence: z.string().uuid().nullable() }).passthrough(),
    })
    .safeParse(claim);
  if (!envelope.success || envelope.data.job.id !== job.id)
    throw new AnalysisFailure("SAVE_FAILED");
  if (!envelope.data.dispatch) {
    const cached = checked(
      await caller.supabase
        .from("sw_processing_jobs")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("id", job.id)
        .single(),
    );
    if (!cached) throw new AnalysisFailure("SAVE_FAILED");
    await requireWorkspace(caller, data.workspaceId, true);
    return cached;
  }
  const fence = envelope.data.job.fence;
  if (!fence) throw new AnalysisFailure("SAVE_FAILED");
  const result = await (options.dispatch ?? dispatchSwAiOnce)(prepared.input, configuration, {
    beforeDispatch: (signal) =>
      recheckBeforeDispatch(caller, data, job, configuration, env, signal),
  });
  const payload = JSON.stringify(
    result.status === "succeeded"
      ? {
          status: result.status,
          output: result.output,
          provider: result.provider,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costMicros: result.usage.costMicros,
        }
      : { status: result.status, errorCode: result.errorCode },
  );
  const signature = signProcessingReceipt("ai", job.id, fence, payload, env);
  const completed = checked(
    await caller.supabase.rpc("sw_complete_processing", {
      _workspace_id: data.workspaceId,
      _job_id: job.id,
      _fence: fence,
      _key_id: signature.keyId,
      _payload: payload,
      _signature: signature.signature,
    }),
  );
  if (!completed) throw new AnalysisFailure("SAVE_FAILED");
  await requireWorkspace(caller, data.workspaceId, true);
  await requireCurrent(caller, data);
  return completed;
}
