// Synthetic in-memory repository and provider only. No credentials or network.
import assert from "node:assert/strict";
import { checked } from "../src/lib/security-work/analysis-services";
import { createHash } from "node:crypto";
import { requestAiDraft, workAiStatus } from "../src/lib/security-work/processing/ai-jobs.server";
import { analysisInputFromJob as mapFrozenJob } from "../src/lib/security-work/processing/job-input.server";
import {
  dispatchSwAiOnce,
  validateAnalysisInput,
  validateAnalysisOutput,
  type DispatchResult,
  analysisInputHash,
} from "../src/lib/security-work/processing/ai.server";
import {
  REPORT_SECTIONS,
  SW_AI_OUTPUT_VERSION,
  SW_AI_POLICY_VERSION,
  SW_AI_PROMPT_VERSION,
  SW_AI_TASK_VERSION,
} from "../src/lib/security-work/processing/contracts";
import type { SecurityWorkCaller } from "../src/lib/security-work/services";

const ids = Array.from(
  { length: 10 },
  (_, index) => `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const env = {
  SW_AI_ENABLED: "true",
  SW_AI_PROVIDER: "anthropic",
  SW_AI_MODEL: "claude-synthetic-pinned-20260101",
  SW_AI_ENVIRONMENT: "internal_qa",
  SW_ANTHROPIC_API_KEY: "synthetic",
  SW_WORKER_KEY_ID: "synthetic",
  SW_WORKER_SECRET: "synthetic-worker-secret-at-least-32-bytes",
};
const request = { workspaceId: ids[0], assessmentId: ids[1], version: 1, requestId: ids[2] };
const activation = {
  id: ids[3],
  workspace_id: ids[0],
  provider: env.SW_AI_PROVIDER,
  model: env.SW_AI_MODEL,
  environment: env.SW_AI_ENVIRONMENT,
  purpose: "draft_analysis",
  task_version: SW_AI_TASK_VERSION,
  prompt_version: SW_AI_PROMPT_VERSION,
  policy_version: SW_AI_POLICY_VERSION,
  output_schema_version: SW_AI_OUTPUT_VERSION,
  data_processing_approval: "synthetic-approval",
  approved_at: "2020-01-01T00:00:00+00:00",
  valid_until: "2099-01-01T00:00:00+00:00",
  max_output_tokens: 2048,
  timeout_ms: 5000,
};
const source = "Synthetic continuity evidence.";
const sourceRows = () => [
  {
    id: ids[5],
    workspace_id: ids[0],
    original_title: "Synthetic continuity record",
    publisher: "Synthetic publisher",
    published_at: "2021-03-01T00:00:00+00:00",
    retrieved_at: "2026-09-24T10:00:00+00:00",
    private_unselected_field: "DO_NOT_SEND_SOURCE_PRIVATE_METADATA",
  },
];
const analysisInputFromJob = (
  ...args:
    | Parameters<typeof mapFrozenJob>
    | [
        Parameters<typeof mapFrozenJob>[0],
        Parameters<typeof mapFrozenJob>[1],
        Parameters<typeof mapFrozenJob>[2],
      ]
) => mapFrozenJob(args[0], args[1], args[2], args.length === 4 ? args[3] : sourceRows());
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const manifest = () => ({
  assessment: {
    id: ids[1],
    workspace_id: ids[0],
    version: 1,
    analysis_type: "rsa",
    title: "Synthetic draft",
    scope: "Synthetic scope",
    context_snapshot: {},
    private_unselected_field: "DO_NOT_SEND_INTERNAL_METADATA",
  },
  activation,
  sources: [
    {
      segmentId: ids[4],
      sourceItemId: ids[5],
      text: source,
      sha256: hash(source),
      locator: "page 1",
      reviewVersion: 1,
    },
  ],
  questions: [
    {
      id: ids[6],
      workspace_id: ids[0],
      assessment_id: ids[1],
      question: "What remains uncertain?",
      answer: "Exercise participation is assumed.",
      evidence_kind: "assumption",
      version: 1,
    },
  ],
});
const output = () => ({
  schemaVersion: SW_AI_OUTPUT_VERSION,
  facts: [],
  userInterpretations: [],
  assumptions: [],
  proposals: [],
  uncertainty: "Synthetic missing information.",
  risks: [],
  followups: [],
  contradictions: [],
  report: {
    kind: "rsa",
    sections: REPORT_SECTIONS.rsa.map((key) => ({
      key,
      content: [],
      missingInformation: "Missing evidence.",
    })),
  },
});
type Row = Record<string, unknown>;
function repository() {
  const tables: Record<string, Row[]> = {
    sw_workspace_memberships: [
      { workspace_id: ids[0], user_id: ids[7], active: true, role: "owner" },
    ],
    sw_assessments: [{ id: ids[1], workspace_id: ids[0], version: 1, status: "draft" }],
    sw_ai_activations: [activation],
    sw_ai_activation_revocations: [],
    sw_processing_jobs: [],
    sw_workspaces: [{ id: ids[0], language: "sv" }],
    sw_analysis_inputs: [
      {
        workspace_id: ids[0],
        assessment_id: ids[1],
        source_item_id: ids[5],
        review_status: "accepted",
        version: 1,
      },
    ],
    sw_analysis_questions: manifest().questions,
    sw_source_items: sourceRows(),
  };
  const calls: string[] = [];
  let completeFails = false;
  let claimAlreadyTaken = false;
  const job = (status = "reserved") => ({
    id: ids[2],
    workspace_id: ids[0],
    kind: "ai",
    assessment_id: ids[1],
    document_id: null,
    expected_version: 1,
    activation_id: ids[3],
    input_manifest: manifest(),
    input_hash: hash("synthetic-db-canonical-json"),
    status,
    fence: status === "reserved" ? null : ids[8],
    created_by: ids[7],
    output: null,
  });
  class Query implements PromiseLike<{ data: Row[] | Row | null; error: null }> {
    filters: Array<(row: Row) => boolean> = [];
    singleRow = false;
    maximum = Infinity;
    constructor(readonly table: string) {
      calls.push(`read:${table}`);
    }
    select() {
      return this;
    }
    eq(key: string, value: unknown) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    gt(key: string, value: string) {
      this.filters.push((row) => String(row[key]) > value);
      return this;
    }
    in(key: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[key]));
      return this;
    }
    order() {
      return this;
    }
    abortSignal() {
      return this;
    }
    limit(value: number) {
      this.maximum = value;
      return this;
    }
    single() {
      this.singleRow = true;
      return this;
    }
    maybeSingle() {
      return this.single();
    }
    then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const rows = (tables[this.table] ?? [])
        .filter((row) => this.filters.every((filter) => filter(row)))
        .slice(0, this.maximum);
      return Promise.resolve({ data: this.singleRow ? (rows[0] ?? null) : rows, error: null }).then(
        onfulfilled,
        onrejected,
      );
    }
  }
  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Row) => {
      calls.push(name);
      if (name === "sw_reserve_processing") {
        if (tables.sw_processing_jobs.length)
          return { data: tables.sw_processing_jobs[0], error: null };
        tables.sw_processing_jobs.push(job());
        return { data: tables.sw_processing_jobs[0], error: null };
      }
      const current = tables.sw_processing_jobs[0];
      if (name === "sw_dispatch_processing") {
        if (claimAlreadyTaken) current.status = "dispatched";
        const dispatch = current.status === "reserved";
        current.status = "dispatched";
        current.fence = ids[8];
        return { data: { dispatch, job: { ...current } }, error: null };
      }
      assert.equal(name, "sw_complete_processing");
      assert.equal(args._fence, ids[8]);
      assert.equal(args._key_id, "synthetic");
      assert.match(String(args._signature), /^[a-f0-9]{64}$/);
      if (completeFails) return { data: null, error: { code: "network_failure" } };
      const payload = JSON.parse(String(args._payload));
      current.status = payload.status;
      current.output = payload.output ?? null;
      current.error_code = payload.errorCode ?? null;
      return { data: { ...current }, error: null };
    },
  };
  return {
    tables,
    calls,
    job,
    caller: { supabase: client, userId: ids[7] } as unknown as SecurityWorkCaller,
    setCompleteFailure: () => {
      completeFails = true;
    },
    setClaimTaken: () => {
      claimAlreadyTaken = true;
    },
  };
}
let checks = 0;
async function test(label: string, run: () => void | Promise<void>) {
  try {
    await run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "failed"}`, {
      cause: error,
    });
  }
}
const noDispatch = async (): Promise<DispatchResult> => {
  throw new Error("Unexpected provider dispatch");
};
await test("inactive AI status is sanitized and makes no approval/provider call", async () => {
  const r = repository();
  assert.deepEqual(await workAiStatus(r.caller, ids[0], {}), {
    enabled: false,
    reason: "AI_NOT_ENABLED",
  });
  assert(!r.calls.includes("read:sw_ai_activations"));
});
await test("workspace membership is required before status access", async () => {
  const r = repository();
  r.tables.sw_workspace_memberships = [];
  await assert.rejects(workAiStatus(r.caller, ids[0], env), /ACCESS_DENIED/);
  assert(!r.calls.includes("read:sw_ai_activations"));
});
await test("approval is independently pinned and revoked or ambiguous is disabled", async () => {
  const r = repository();
  assert.deepEqual(await workAiStatus(r.caller, ids[0], env), { enabled: true, reason: null });
  r.tables.sw_ai_activation_revocations.push({ activation_id: ids[3] });
  assert.equal((await workAiStatus(r.caller, ids[0], env)).enabled, false);
  r.tables.sw_ai_activation_revocations = [];
  r.tables.sw_ai_activations.push({ ...activation, id: ids[9] });
  assert.equal((await workAiStatus(r.caller, ids[0], env)).reason, "AI_APPROVAL_AMBIGUOUS");
});
await test("worker key preflight rejects short secrets before reservation", async () => {
  const r = repository();
  await assert.rejects(
    requestAiDraft(r.caller, request, {
      env: { ...env, SW_WORKER_SECRET: "short" },
      dispatch: noDispatch,
    }),
    /PROCESSING_NOT_CONFIGURED/,
  );
  assert(!r.calls.includes("sw_reserve_processing"));
});
await test("manifest maps only allowlisted content and preserves explicit assumptions", () => {
  const mapped = analysisInputFromJob(manifest(), { ...request, activationId: ids[3] }, "sv");
  assert(!JSON.stringify(mapped.input).includes("DO_NOT_SEND_INTERNAL_METADATA"));
  assert(!JSON.stringify(mapped.input).includes("DO_NOT_SEND_SOURCE_PRIVATE_METADATA"));
  assert.equal(mapped.input.calibration, null);
  assert.equal(mapped.input.purpose, "draft_report");
  const assumption = mapped.input.userInputs.find((item) => item.kind === "assumption")!;
  assert.throws(
    () =>
      validateAnalysisOutput(
        {
          ...output(),
          userInterpretations: [
            {
              kind: "user_interpretation",
              statement: assumption.text,
              citations: [],
              userInputIds: [assumption.id],
              uncertainty: "",
            },
          ],
        },
        mapped.input,
      ),
    /ASSUMPTION_MISLABELLED/,
  );
});
await test("metadata is bound to exact frozen IDs, workspace and input hash independently of source text", () => {
  const mapped = analysisInputFromJob(manifest(), { ...request, activationId: ids[3] }, "sv");
  assert(!/2021|2026/.test(mapped.input.manifest[0].text));
  assert.deepEqual(mapped.input.manifest[0].metadata, {
    title: "Synthetic continuity record",
    publisher: "Synthetic publisher",
    publishedAt: "2021-03-01T00:00:00+00:00",
    retrievedAt: "2026-09-24T10:00:00+00:00",
  });
  const changed = sourceRows();
  changed[0].published_at = "2025-03-01T00:00:00+00:00";
  assert.notEqual(
    analysisInputHash(mapped.input),
    analysisInputHash(
      analysisInputFromJob(manifest(), { ...request, activationId: ids[3] }, "sv", changed).input,
    ),
  );
  for (const rows of [
    [],
    [{ ...sourceRows()[0], id: ids[9] }],
    [{ ...sourceRows()[0], workspace_id: ids[9] }],
    [...sourceRows(), ...sourceRows()],
    [{ ...sourceRows()[0], published_at: "invalid" }],
  ])
    assert.throws(
      () => analysisInputFromJob(manifest(), { ...request, activationId: ids[3] }, "sv", rows),
      /SOURCE_METADATA_UNAVAILABLE/,
    );
});
await test("caller lookup reads only reserved source IDs and fails before claim if unavailable", async () => {
  for (const rows of [[], [{ ...sourceRows()[0], workspace_id: ids[9] }]]) {
    const r = repository();
    r.tables.sw_source_items = rows;
    await assert.rejects(
      requestAiDraft(r.caller, request, { env, dispatch: noDispatch }),
      /AI_INPUT_INVALID/,
    );
    assert(!r.calls.includes("sw_dispatch_processing"));
  }
  const r = repository();
  r.tables.sw_source_items.push({
    ...sourceRows()[0],
    id: ids[9],
    original_title: "UNREFERENCED_SOURCE_MUST_NOT_SEND",
  });
  await requestAiDraft(r.caller, request, {
    env,
    dispatch: async (input, configuration, options) =>
      dispatchSwAiOnce(input, configuration, {
        ...options,
        fetchImpl: async (_url, init) => {
          if (init?.method === "GET") return Response.json({ id: env.SW_AI_MODEL });
          assert(!String(init?.body).includes("UNREFERENCED_SOURCE_MUST_NOT_SEND"));
          assert(String(init?.body).includes("2021-03-01"));
          return Response.json({
            model: env.SW_AI_MODEL,
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(output()) }],
            usage: { input_tokens: 50, output_tokens: 100 },
          });
        },
      }),
  });
  assert.equal(r.calls.filter((call) => call === "read:sw_source_items").length, 2);
});
await test("questions, user context and generated followups share the 4000 character boundary", () => {
  const value = manifest();
  value.questions[0].question = "Q".repeat(4000);
  const mapped = analysisInputFromJob(value, { ...request, activationId: ids[3] }, "sv");
  const answer = mapped.input.userInputs.find((item) => item.kind === "assumption")!;
  assert.equal(answer.context, value.questions[0].question);
  assert.deepEqual(validateAnalysisInput(mapped.input), mapped.input);
  const followup = {
    kind: "ai_proposal",
    statement: value.questions[0].question,
    citations: [],
    userInputIds: [],
    uncertainty: "This answer is needed to establish the missing evidence before deciding.",
  };
  assert.equal(
    validateAnalysisOutput({ ...output(), followups: [followup] }, mapped.input).followups[0]
      .statement.length,
    4000,
  );
  assert.throws(
    () =>
      validateAnalysisInput({
        ...mapped.input,
        userInputs: [{ ...answer, context: "Q".repeat(4001) }],
      }),
    /INPUT_INVALID/,
  );
  assert.throws(
    () =>
      validateAnalysisOutput(
        { ...output(), followups: [{ ...followup, statement: "Q".repeat(4001) }] },
        mapped.input,
      ),
    /SCHEMA_INVALID/,
  );
  value.questions[0].question += "Q";
  assert.throws(
    () => analysisInputFromJob(value, { ...request, activationId: ids[3] }, "sv"),
    /INPUT_INVALID/,
  );
});
await test("frozen method and job date reach the provider without using the current runtime clock", () => {
  const method = {
    id: "rsa-v1",
    analysis_type: "rsa",
    definition: { version: 1, unknownIsLow: false },
  };
  const asOf = "2026-09-24T12:00:00.000Z";
  const mapped = analysisInputFromJob(
    { ...manifest(), method },
    { ...request, activationId: ids[3], asOf },
    "sv",
  );
  assert.equal(mapped.input.asOf, asOf);
  assert.deepEqual(mapped.input.methodSnapshot, {
    id: "rsa-v1",
    analysisType: "rsa",
    definition: method.definition,
  });
  assert.throws(
    () =>
      analysisInputFromJob(
        { ...manifest(), method: { ...method, analysis_type: "monitoring" } },
        { ...request, activationId: ids[3], asOf },
        "sv",
      ),
    /METHOD_MISMATCH/,
  );
});
await test("generated 4000 character followup survives the next AI run and cached retry", async () => {
  const first = analysisInputFromJob(manifest(), { ...request, activationId: ids[3] }, "sv");
  const generated = validateAnalysisOutput(
    {
      ...output(),
      followups: [
        {
          kind: "ai_proposal",
          statement: "Q".repeat(4000),
          citations: [],
          userInputIds: [],
          uncertainty: "This answer is needed to establish the missing evidence before deciding.",
        },
      ],
    },
    first.input,
  );
  const next = manifest();
  next.questions[0].question = generated.followups[0].statement;
  next.questions[0].version = 2;
  const r = repository();
  r.tables.sw_analysis_questions = next.questions;
  r.tables.sw_processing_jobs.push({ ...r.job(), input_manifest: next });
  let posts = 0;
  const completed = await requestAiDraft(r.caller, request, {
    env,
    dispatch: (input, configuration, options) =>
      dispatchSwAiOnce(input, configuration, {
        ...options,
        fetchImpl: async (_url, init) => {
          if (init?.method === "GET") return Response.json({ id: env.SW_AI_MODEL });
          posts += 1;
          assert(String(init?.body).includes(generated.followups[0].statement));
          return Response.json({
            model: env.SW_AI_MODEL,
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(output()) }],
            usage: { input_tokens: 50, output_tokens: 100 },
          });
        },
      }),
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(
    (await requestAiDraft(r.caller, request, { env, dispatch: noDispatch })).status,
    "succeeded",
  );
  assert.equal(posts, 1);
  assert.equal(r.calls.filter((call) => call === "sw_dispatch_processing").length, 1);
  assert(!r.calls.includes("sw_reserve_processing"));
});
await test("long immutable manual source uses stable bounded chunks and source item identity", () => {
  const value = manifest();
  const text = "Evidence ".repeat(5000);
  value.sources[0] = { ...value.sources[0], text, sha256: hash(text) };
  const a = analysisInputFromJob(value, { ...request, activationId: ids[3] }, "sv");
  const b = analysisInputFromJob(value, { ...request, activationId: ids[3] }, "sv");
  assert.deepEqual(a, b);
  assert(a.input.manifest.length > 1);
  assert(
    a.input.manifest.every((item) => item.text.length <= 16000 && item.sourceItemId === ids[5]),
  );
  value.sources[0].text += "changed";
  assert.throws(
    () => analysisInputFromJob(value, { ...request, activationId: ids[3] }, "sv"),
    /MANIFEST_HASH_MISMATCH/,
  );
});
await test("stale version conflicts before provider or reservation", async () => {
  const r = repository();
  r.tables.sw_assessments[0].version = 2;
  await assert.rejects(
    requestAiDraft(r.caller, request, { env, dispatch: noDispatch }),
    /CONFLICT/,
  );
  assert(!r.calls.includes("sw_reserve_processing"));
});
await test("cached unknown outcome needs no live activation and never dispatches", async () => {
  const r = repository();
  r.tables.sw_processing_jobs.push(r.job("outcome_unknown"));
  const cached = await requestAiDraft(r.caller, request, { env: {}, dispatch: noDispatch });
  assert.equal(cached.status, "outcome_unknown");
  assert(!r.calls.includes("sw_reserve_processing"));
});
await test("a new request UUID for identical input returns the canonical job without redispatch", async () => {
  const r = repository();
  r.tables.sw_processing_jobs.push(r.job("outcome_unknown"));
  const cached = await requestAiDraft(
    r.caller,
    { ...request, requestId: ids[9] },
    { env, dispatch: noDispatch },
  );
  assert.equal(cached.id, request.requestId);
  assert.equal(cached.status, "outcome_unknown");
  assert.equal(r.calls.filter((call) => call === "sw_reserve_processing").length, 1);
  assert(!r.calls.includes("sw_dispatch_processing"));
});
await test("request identity cannot be reused for another creator", async () => {
  const r = repository();
  r.tables.sw_processing_jobs.push({ ...r.job("succeeded"), created_by: ids[9] });
  await assert.rejects(
    requestAiDraft(r.caller, request, { env, dispatch: noDispatch }),
    /CONFLICT/,
  );
});
await test("concurrent claim loss never starts provider transport", async () => {
  const r = repository();
  r.setClaimTaken();
  assert.equal(
    (await requestAiDraft(r.caller, request, { env, dispatch: noDispatch })).status,
    "dispatched",
  );
});
await test("successful proposal is signed and cached without applying business rows", async () => {
  const r = repository();
  let dispatches = 0;
  const result = await requestAiDraft(r.caller, request, {
    env,
    dispatch: async (input, configuration) => {
      dispatches += 1;
      assert.equal(configuration.activation.workspaceId, ids[0]);
      const parsed = analysisInputFromJob(
        manifest(),
        { ...request, activationId: ids[3] },
        "sv",
      ).input;
      assert.deepEqual(input, parsed);
      return {
        status: "succeeded",
        output: validateAnalysisOutput(output(), parsed),
        provider: "anthropic",
        model: env.SW_AI_MODEL,
        usage: { inputTokens: 50, outputTokens: 100, costMicros: null },
        inputHash: hash("synthetic"),
        withheldSegmentIds: [],
      };
    },
  });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.output, output());
  await requestAiDraft(r.caller, request, { env, dispatch: noDispatch });
  assert.equal(dispatches, 1);
  assert.equal(r.calls.filter((call) => call === "sw_reserve_processing").length, 1);
  assert.deepEqual(
    r.calls.filter((call) => call.startsWith("sw_")),
    ["sw_reserve_processing", "sw_dispatch_processing", "sw_complete_processing"],
  );
});
await test("provider failure remains failed, never a fabricated proposal", async () => {
  const r = repository();
  const result = await requestAiDraft(r.caller, request, {
    env,
    dispatch: async () => ({
      status: "failed",
      errorCode: "schema_invalid",
      usage: { inputTokens: null, outputTokens: null, costMicros: null },
      inputHash: null,
      withheldSegmentIds: [],
    }),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.output, null);
  assert.equal(result.error_code, "schema_invalid");
});
await test("lost completion acknowledgement cannot cause a second provider dispatch", async () => {
  const r = repository();
  r.setCompleteFailure();
  await assert.rejects(
    requestAiDraft(r.caller, request, {
      env,
      dispatch: async () => ({
        status: "outcome_unknown",
        errorCode: "transport",
        usage: { inputTokens: null, outputTokens: null, costMicros: null },
        inputHash: null,
        withheldSegmentIds: [],
      }),
    }),
    /SAVE_FAILED/,
  );
  assert.equal(
    (await requestAiDraft(r.caller, request, { env, dispatch: noDispatch })).status,
    "dispatched",
  );
});
await test("current caller approval and input are rechecked after actual model preflight", async () => {
  const r = repository();
  let posts = 0;
  const completed = await requestAiDraft(r.caller, request, {
    env,
    dispatch: (input, configuration, options) =>
      dispatchSwAiOnce(input, configuration, {
        ...options,
        fetchImpl: async (_url, init) => {
          if (init?.method === "GET") return Response.json({ id: env.SW_AI_MODEL });
          posts += 1;
          return Response.json({
            model: env.SW_AI_MODEL,
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(output()) }],
            usage: { input_tokens: 50, output_tokens: 100 },
          });
        },
      }),
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(posts, 1);
  assert(r.calls.filter((call) => call === "read:sw_ai_activation_revocations").length >= 2);
  assert(r.calls.includes("read:sw_analysis_inputs"));
  assert(r.calls.includes("read:sw_analysis_questions"));
});
await test("revocation during model preflight blocks source transmission without a second reservation", async () => {
  const r = repository();
  let posts = 0;
  const completed = await requestAiDraft(r.caller, request, {
    env,
    dispatch: (input, configuration, options) =>
      dispatchSwAiOnce(input, configuration, {
        ...options,
        fetchImpl: async (_url, init) => {
          if (init?.method === "GET") {
            r.tables.sw_ai_activation_revocations.push({ activation_id: ids[3] });
            return Response.json({ id: env.SW_AI_MODEL });
          }
          posts += 1;
          throw new Error("Unexpected material POST");
        },
      }),
  });
  assert.equal(completed.status, "failed");
  assert.equal(completed.error_code, "authorization_not_confirmed");
  assert.equal(posts, 0);
  assert.equal(r.calls.filter((call) => call === "sw_reserve_processing").length, 1);
});
await test("changed source review or question version during preflight blocks source transmission", async () => {
  for (const mutate of [
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_analysis_inputs[0].review_status = "rejected";
    },
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_analysis_questions[0].version = 2;
    },
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_analysis_inputs.push({
        workspace_id: ids[0],
        assessment_id: ids[1],
        source_item_id: ids[9],
        review_status: "accepted",
        version: 1,
      });
    },
  ]) {
    const r = repository();
    let posts = 0;
    const completed = await requestAiDraft(r.caller, request, {
      env,
      dispatch: (input, configuration, options) =>
        dispatchSwAiOnce(input, configuration, {
          ...options,
          fetchImpl: async (_url, init) => {
            if (init?.method === "GET") {
              mutate(r);
              return Response.json({ id: env.SW_AI_MODEL });
            }
            posts += 1;
            throw new Error("Unexpected material POST");
          },
        }),
    });
    assert.equal(completed.status, "failed");
    assert.equal(completed.error_code, "authorization_not_confirmed");
    assert.equal(posts, 0);
  }
});
await test("membership removal during preflight prevents provider POST and denies the caller", async () => {
  const r = repository();
  let posts = 0;
  await assert.rejects(
    requestAiDraft(r.caller, request, {
      env,
      dispatch: (input, configuration, options) =>
        dispatchSwAiOnce(input, configuration, {
          ...options,
          fetchImpl: async (_url, init) => {
            if (init?.method === "GET") {
              r.tables.sw_workspace_memberships = [];
              return Response.json({ id: env.SW_AI_MODEL });
            }
            posts += 1;
            throw new Error("Unexpected material POST");
          },
        }),
    }),
    /ACCESS_DENIED/,
  );
  assert.equal(posts, 0);
});
await test("missing, foreign or altered immutable metadata during preflight prevents source POST", async () => {
  for (const mutate of [
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_source_items = [];
    },
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_source_items[0].workspace_id = ids[9];
    },
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_source_items[0].published_at = "2025-01-01T00:00:00+00:00";
    },
    (r: ReturnType<typeof repository>) => {
      r.tables.sw_source_items[0].original_title = "Changed after preparation";
    },
  ]) {
    const r = repository();
    let posts = 0;
    const result = await requestAiDraft(r.caller, request, {
      env,
      dispatch: (input, configuration, options) =>
        dispatchSwAiOnce(input, configuration, {
          ...options,
          fetchImpl: async (_url, init) => {
            if (init?.method === "GET") {
              mutate(r);
              return Response.json({ id: env.SW_AI_MODEL });
            }
            posts++;
            throw new Error("Unexpected source transmission");
          },
        }),
    });
    assert.equal(result.status, "failed");
    assert(
      ["source_metadata_unavailable", "authorization_not_confirmed"].includes(result.error_code!),
    );
    assert.equal(posts, 0);
  }
});
await test("AI budget refusal stays actionable without exposing arbitrary database errors", async () => {
  assert.throws(
    () => checked({ data: null, error: { code: "23514", message: "SW_AI_BUDGET_EXCEEDED" } }),
    /AI_BUDGET_EXCEEDED/,
  );
  assert.throws(
    () => checked({ data: null, error: { code: "23514", message: "private database detail" } }),
    /^Error: INVALID_INPUT$/,
  );
  assert.throws(
    () => checked({ data: null, error: { code: "42501", message: "SW_AI_BUDGET_EXCEEDED" } }),
    /^Error: ACCESS_DENIED$/,
  );
});

console.log(
  `Security Work AI jobs: ${checks} synthetic checks passed; no database or provider calls.`,
);
